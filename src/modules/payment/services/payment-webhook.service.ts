import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { AuditActorType } from '../../../common/enums';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { PaymentDbService } from '../payment.db.service';
import { RefundService } from './refund.service';

/**
 * Handles all inbound webhook events from the payment gateway.
 *
 * Rules (Docs 01 §16):
 * - payment_intent.succeeded  → UNPAID/FAILED → PAID; order PENDING → CONFIRMED;
 *   user totalOrders++, totalSpent += total; if order was already CANCELLED (late payment) → auto-refund
 * - payment_intent.failed     → UNPAID → FAILED; order stays PENDING (customer can retry)
 * - payment_intent.canceled   → UNPAID → CANCELED
 *
 * All handlers are guarded (WHERE status = expected) so duplicate webhook delivery
 * never double-counts stats. Verified against docs: 01 §16, 11 §2.
 */
@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly paymentDb: PaymentDbService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly refundService: RefundService,
  ) {}

  /**
   * Handles payment_intent.succeeded webhook event.
   * Uses RepeatableRead-equivalent guarded updateMany to prevent double-credit.
   */
  async handlePaymentSucceeded(gatewayRef: string): Promise<void> {
    // Look up payment record first
    const payment = await this.paymentDb.findByGatewayRef(gatewayRef);

    if (!payment) {
      this.logger.warn(
        `[Webhook] payment_intent.succeeded: payment with gatewayRef "${gatewayRef}" not found — skipping.`,
      );
      return;
    }

    const order = payment.order;
    let isLatePayment = false;

    await this.paymentDb.runInTransaction(async (tx) => {
      const { updated, payment: updatedPayment } =
        await this.paymentDb.confirmPaymentInTx(gatewayRef, tx);

      if (!updated) {
        // Already processed — idempotent skip
        this.logger.log(
          `[Webhook] payment_intent.succeeded (${gatewayRef}): already processed — skipping.`,
        );
        return;
      }

      // Check current order status (may have been CANCELLED by timeout)
      const currentOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: { id: true, status: true, userId: true, total: true, orderNumber: true },
      });

      if (!currentOrder) return;

      if (currentOrder.status === OrderStatus.PENDING) {
        // Normal path: confirm order
        await tx.order.update({
          where: { id: currentOrder.id },
          data: {
            status: OrderStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PAID,
            confirmedAt: new Date(),
          },
        });

        // Increment user stats: totalOrders + 1, totalSpent += order.total
        await tx.user.update({
          where: { id: currentOrder.userId },
          data: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: new Prisma.Decimal(currentOrder.total) },
          },
        });

        this.logger.log(
          `[Webhook] Order ${currentOrder.orderNumber} confirmed (payment ${updatedPayment?.id}).`,
        );
      } else if (currentOrder.status === OrderStatus.CANCELLED) {
        // Late payment: order already cancelled by timeout.
        // Mark payment PAID already done; now trigger auto-refund (after-commit).
        // We set order to REFUND_PENDING so the RefundService picks it up.
        await tx.order.updateMany({
          where: { id: currentOrder.id, status: OrderStatus.CANCELLED },
          data: {
            status: OrderStatus.REFUND_PENDING,
            paymentStatus: PaymentStatus.PAID,
          },
        });

        isLatePayment = true;
        this.logger.warn(
          `[Webhook] Late payment detected for cancelled order ${currentOrder.orderNumber} — set to REFUND_PENDING for auto-refund.`,
        );
      }
      // Other statuses (CONFIRMED, DELIVERED, etc.) — payment already PAID, nothing to do
    });

    // If late payment, trigger automatic refund immediately post-commit (Docs 01 §16)
    if (isLatePayment) {
      this.refundService
        .processRefund(
          order.id,
          order.orderNumber,
          order.userId,
          payment.id,
          gatewayRef,
          new Prisma.Decimal(order.total),
          false,
        )
        .catch((err) => {
          this.logger.error(
            `[Webhook] Immediate post-commit auto-refund failed for late payment (cron will retry): ${(err as Error).message}`,
          );
        });
    }

    // Post-commit notifications (fire-and-forget)
    this.notificationService
      .dispatchUserNotification(order.userId, {
        title: 'Payment Confirmed',
        message: `Your payment for order #${order.orderNumber} has been received.`,
        referenceId: order.id,
        referenceEvent: 'PAYMENT_CONFIRMED',
      })
      .catch((err) => {
        this.logger.error(
          `Failed to dispatch payment confirmed notification: ${(err as Error).message}`,
        );
      });

    this.notificationService
      .dispatchAdminNotification({
        title: 'Payment Received',
        message: `Payment received for order #${order.orderNumber}.`,
        referenceId: order.id,
        referenceEvent: 'PAYMENT_RECEIVED',
      })
      .catch((err) => {
        this.logger.error(
          `Failed to dispatch admin payment notification: ${(err as Error).message}`,
        );
      });

    this.auditService
      .log({
        entityType: 'PAYMENT',
        entityId: payment.id,
        action: 'PAYMENT_SUCCEEDED',
        actorType: AuditActorType.SYSTEM_TRIGGER,
        actorId: 'SYSTEM',
        details: { gatewayRef, orderId: order.id, orderNumber: order.orderNumber },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record payment succeeded audit log: ${(err as Error).message}`,
        );
      });
  }

  /**
   * Handles payment_intent.payment_failed webhook event.
   * Order stays PENDING — customer can retry payment (another initiate call).
   * Verified against docs: 01 §16.
   */
  async handlePaymentFailed(
    gatewayRef: string,
    failureReason?: string,
  ): Promise<void> {
    const payment = await this.paymentDb.findByGatewayRef(gatewayRef);

    if (!payment) {
      this.logger.warn(
        `[Webhook] payment_intent.failed: payment with gatewayRef "${gatewayRef}" not found — skipping.`,
      );
      return;
    }

    const updated = await this.paymentDb.markPaymentFailed(
      gatewayRef,
      failureReason,
    );

    if (!updated) {
      this.logger.log(
        `[Webhook] payment_intent.failed (${gatewayRef}): already in terminal state — skipping.`,
      );
      return;
    }

    this.logger.log(
      `[Webhook] Payment ${payment.id} (${gatewayRef}) marked FAILED for order ${payment.order.orderNumber}.`,
    );

    // Notify customer so they can retry
    this.notificationService
      .dispatchUserNotification(payment.order.userId, {
        title: 'Payment Failed',
        message: `Your payment for order #${payment.order.orderNumber} failed. Please try again.`,
        referenceId: payment.order.id,
        referenceEvent: 'PAYMENT_FAILED',
      })
      .catch((err) => {
        this.logger.error(
          `Failed to dispatch payment failed notification: ${(err as Error).message}`,
        );
      });
  }

  /**
   * Handles payment_intent.canceled webhook event.
   * Marks payment CANCELED (from UNPAID).
   * Verified against docs: 01 §16.
   */
  async handlePaymentCanceled(gatewayRef: string): Promise<void> {
    const payment = await this.paymentDb.findByGatewayRef(gatewayRef);

    if (!payment) {
      this.logger.warn(
        `[Webhook] payment_intent.canceled: payment with gatewayRef "${gatewayRef}" not found — skipping.`,
      );
      return;
    }

    const updated = await this.paymentDb.markPaymentCanceled(gatewayRef);

    if (!updated) {
      this.logger.log(
        `[Webhook] payment_intent.canceled (${gatewayRef}): already in terminal state — skipping.`,
      );
      return;
    }

    this.logger.log(
      `[Webhook] Payment ${payment.id} (${gatewayRef}) CANCELED for order ${payment.order.orderNumber}.`,
    );
  }

  /**
   * Handles charge.refunded webhook event.
   *
   * Rules (Docs 01 §16):
   * - Full refund only (partial → skip + log warning for manual review).
   * - Guarded status update: payment PAID → REFUNDED, order REFUND_PENDING → CANCELLED,
   *   paymentStatus REFUNDED, totalSpent -= total.
   * - Idempotent: already refunded payments are skipped safely.
   */
  async handleChargeRefunded(
    gatewayRef: string,
    amountPence?: number,
  ): Promise<void> {
    const payment = await this.paymentDb.findByGatewayRef(gatewayRef);

    if (!payment) {
      this.logger.warn(
        `[Webhook] charge.refunded: payment with gatewayRef "${gatewayRef}" not found — skipping.`,
      );
      return;
    }

    if (payment.status !== PaymentStatus.PAID) {
      this.logger.log(
        `[Webhook] charge.refunded (${gatewayRef}): payment status is ${payment.status} (not PAID) — skipping.`,
      );
      return;
    }

    const order = payment.order;

    // Guard: only process automated refund when order is in REFUND_PENDING state.
    // If admin manually triggered a refund from Stripe dashboard while the order is still
    // CONFIRMED/PROCESSING/etc. (bypassing our cancel API), we must NOT auto-cancel the
    // order or decrement totalSpent — that would leave the order in an inconsistent state
    // (active order with no payment to collect). Flag it for manual review instead.
    // Docs 01 §16: "charge.refunded → REFUND_PENDING → CANCELLED"; the REFUND_PENDING
    // precondition is implied by the normal flow but must be enforced explicitly here
    // to guard against out-of-band Stripe dashboard refunds.
    if (order.status !== 'REFUND_PENDING') {
      this.logger.warn(
        `[Webhook] charge.refunded (${gatewayRef}): order ${order.orderNumber} is in status ` +
          `"${order.status}" (expected REFUND_PENDING). This refund was likely triggered manually ` +
          `from the Stripe dashboard, bypassing the cancel API. ` +
          `Payment has been marked PAID by gateway — manual review required to reconcile order status and totalSpent.`,
      );
      return;
    }

    const orderTotal = new Prisma.Decimal(order.total);
    const orderTotalPence = orderTotal.mul(100).toDecimalPlaces(0).toNumber();

    // Partial refund check per Docs 01 §16: automated processing only for full refunds
    if (amountPence !== undefined && amountPence < orderTotalPence) {
      this.logger.warn(
        `[Webhook] charge.refunded (${gatewayRef}): partial refund received (${amountPence} < ${orderTotalPence} pence). Skipped for manual review per Docs 01 §16.`,
      );
      return;
    }

    const changed = await this.paymentDb.runInTransaction((tx) =>
      this.paymentDb.processRefundInTx(
        payment.id,
        order.id,
        order.userId,
        orderTotal,
        !!order.confirmedAt,
        tx,
      ),
    );

    if (!changed) {
      this.logger.log(
        `[Webhook] charge.refunded (${gatewayRef}): already refunded in DB — skipping duplicate.`,
      );
      return;
    }

    this.logger.log(
      `[Webhook] charge.refunded: payment ${payment.id} marked REFUNDED and order ${order.orderNumber} CANCELLED.`,
    );

    // Post-commit side effects (fire-and-forget)
    this.notificationService
      .dispatchUserNotification(order.userId, {
        title: 'Refund Processed',
        message: `Your refund for order #${order.orderNumber} has been processed.`,
        referenceId: order.id,
        referenceEvent: 'PAYMENT_REFUNDED',
      })
      .catch((err) => {
        this.logger.error(
          `Failed to dispatch refund notification: ${(err as Error).message}`,
        );
      });

    this.auditService
      .log({
        entityType: 'PAYMENT',
        entityId: payment.id,
        action: 'REFUND_COMPLETED',
        actorType: AuditActorType.SYSTEM_TRIGGER,
        actorId: 'SYSTEM',
        details: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          gatewayRef,
          amount: orderTotal.toFixed(2),
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record refund completed audit log: ${(err as Error).message}`,
        );
      });
  }
}
