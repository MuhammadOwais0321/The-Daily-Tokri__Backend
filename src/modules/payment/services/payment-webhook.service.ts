import { Injectable, Logger } from '@nestjs/common';
import {
  AuditActorType,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { PaymentDbService } from '../payment.db.service';
import { RefundService } from './refund.service';

/**
 * Processes inbound payment gateway webhook events using guarded status updates for idempotency.
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
   * Handles `payment_intent.succeeded`: confirms `PENDING` orders, increments user stats,
   * or queues an automatic refund if the order was already cancelled by timeout.
   */
  async handlePaymentSucceeded(gatewayRef: string): Promise<void> {
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
        this.logger.log(
          `[Webhook] payment_intent.succeeded (${gatewayRef}): already processed — skipping.`,
        );
        return;
      }

      const currentOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          status: true,
          userId: true,
          total: true,
          orderNumber: true,
        },
      });

      if (!currentOrder) return;

      if (currentOrder.status === OrderStatus.PENDING) {
        await tx.order.update({
          where: { id: currentOrder.id },
          data: {
            status: OrderStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PAID,
            confirmedAt: new Date(),
          },
        });

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
        // Late payment arrived after timeout cancellation; mark REFUND_PENDING for auto-refund
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
    });

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
        details: {
          gatewayRef,
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record payment succeeded audit log: ${(err as Error).message}`,
        );
      });
  }

  /** Marks payment `FAILED` while keeping the order `PENDING` so the customer can retry. */
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

  /** Marks an `UNPAID` payment as `CANCELED`. */
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
   * Handles `charge.refunded` for full refunds on `REFUND_PENDING` orders.
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

    // Only auto-finalize refunds for orders in REFUND_PENDING state; flag out-of-band refunds for manual review
    if (order.status !== 'REFUND_PENDING') {
      this.logger.warn(
        `[Webhook] charge.refunded (${gatewayRef}): order ${order.orderNumber} is in status ` +
          `"${order.status}" (expected REFUND_PENDING). Manual review required.`,
      );
      return;
    }

    const orderTotal = new Prisma.Decimal(order.total);
    const orderTotalPence = orderTotal.mul(100).toDecimalPlaces(0).toNumber();

    // Skip partial refunds for manual review
    if (amountPence !== undefined && amountPence < orderTotalPence) {
      this.logger.warn(
        `[Webhook] charge.refunded (${gatewayRef}): partial refund received (${amountPence} < ${orderTotalPence} pence). Skipped for manual review.`,
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
