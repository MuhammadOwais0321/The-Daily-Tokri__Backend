import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditActorType } from '../../../common/enums';
import {
  PAYMENT_GATEWAY,
  type IPaymentGateway,
} from '../../../infrastructure/payment/payment-gateway.interface';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { PaymentDbService } from '../payment.db.service';

/**
 * Handles all refund operations.
 *
 * Rules (Docs 01 §20, 01 §2.9):
 * - External gateway call happens AFTER DB transaction commit.
 * - On failure, order stays REFUND_PENDING so the retry cron picks it up.
 * - Idempotent: "already refunded" gateway responses are treated as success.
 * - processRefundInTx uses guarded updateMany (PAID → REFUNDED) to prevent double refunds.
 *
 * Also handles the mock-complete endpoint (simulates gateway confirming payment).
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly paymentDb: PaymentDbService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: IPaymentGateway,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Processes a refund for a given payment.
   * Caller must supply the payment record (from paymentDb.findRefundPendingOrders).
   * This method is called:
   *   a) Directly after a cancellation commit (order-cancellation.service.ts post-commit hook)
   *   b) By the refund retry cron for REFUND_PENDING orders
   *
   * Verified against docs: 01 §20, 01 §2.9.
   */
  async processRefund(
    orderId: string,
    orderNumber: string,
    userId: string,
    paymentId: string,
    gatewayRef: string,
    orderTotal: Prisma.Decimal,
    isConfirmed: boolean = true,
  ): Promise<void> {
    const amountPence = orderTotal.mul(100).toDecimalPlaces(0).toNumber();

    // Call gateway BEFORE DB write so we know the outcome
    let refundSuccess = false;
    try {
      const result = await this.gateway.refundPayment(gatewayRef, amountPence);
      refundSuccess = result.refunded;
    } catch (err) {
      const message = (err as Error).message ?? '';
      // Idempotent: treat "already refunded" gateway errors as success
      if (
        message.toLowerCase().includes('already refunded') ||
        message.toLowerCase().includes('already_refunded')
      ) {
        this.logger.log(
          `[RefundService] Gateway reports already refunded for ${gatewayRef} — treating as success.`,
        );
        refundSuccess = true;
      } else {
        this.logger.error(
          `[RefundService] Gateway refund call failed for order ${orderNumber} (${gatewayRef}): ${message}`,
        );
        // Leave order as REFUND_PENDING — cron will retry
        return;
      }
    }

    if (!refundSuccess) {
      this.logger.error(
        `[RefundService] Gateway returned refunded=false for order ${orderNumber} — leaving REFUND_PENDING for retry.`,
      );
      return;
    }

    // Persist refund outcome in DB
    const changed = await this.paymentDb.runInTransaction((tx) =>
      this.paymentDb.processRefundInTx(
        paymentId,
        orderId,
        userId,
        orderTotal,
        isConfirmed,
        tx,
      ),
    );

    if (!changed) {
      // Already refunded in DB (concurrent retry) — safe to skip
      this.logger.log(
        `[RefundService] Payment ${paymentId} already REFUNDED in DB — skipping duplicate.`,
      );
      return;
    }

    this.logger.log(
      `[RefundService] Refund completed for order ${orderNumber} (payment ${paymentId}).`,
    );

    // Post-commit side effects (fire-and-forget)
    this.notificationService
      .dispatchUserNotification(userId, {
        title: 'Refund Processed',
        message: `Your refund for order #${orderNumber} has been processed.`,
        referenceId: orderId,
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
        entityId: paymentId,
        action: 'REFUND_COMPLETED',
        actorType: AuditActorType.SYSTEM_TRIGGER,
        actorId: 'SYSTEM',
        details: { orderId, orderNumber, gatewayRef, amount: orderTotal.toFixed(2) },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record refund audit log: ${(err as Error).message}`,
        );
      });
  }

  /**
   * Processes the mock-complete action triggered by the customer
   * via POST /payments/:id/mock-complete { outcome }.
   *
   * This simulates the gateway receiving a card and immediately posting a webhook.
   * The webhook flow is then delegated to PaymentWebhookService.
   * Returns the payment ID and outcome for the response.
   *
   * Verified against docs: api-reference Part 2.
   */
  async processMockComplete(
    paymentId: string,
    orderId: string,
    outcome: 'succeeded' | 'failed',
    failureReason?: string,
  ): Promise<{ paymentId: string; orderId: string; outcome: string }> {
    // Verify ownership: payment must belong to this order
    const payment = await this.paymentDb.findByIdAndOrderId(paymentId, orderId);

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    // Return result — the caller (PaymentService) will fire the webhook event
    return { paymentId: payment.id, orderId, outcome };
  }
}
