import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditActorType, Prisma } from '@prisma/client';
import {
  PAYMENT_GATEWAY,
  type IPaymentGateway,
} from '../../../infrastructure/payment/payment-gateway.interface';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { PaymentDbService } from '../payment.db.service';

/**
 * Executes gateway refunds outside DB transactions and finalizes `REFUND_PENDING` orders idempotently.
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
   * Calls the payment gateway to refund a payment and atomically transitions the order
   * from `REFUND_PENDING` to `CANCELLED` (`REFUNDED`). Leaves order in `REFUND_PENDING` on failure for cron retry.
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

    let refundSuccess = false;
    try {
      const result = await this.gateway.refundPayment(gatewayRef, amountPence);
      refundSuccess = result.refunded;
    } catch (err) {
      const message = (err as Error).message ?? '';
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
        return;
      }
    }

    if (!refundSuccess) {
      this.logger.error(
        `[RefundService] Gateway returned refunded=false for order ${orderNumber} — leaving REFUND_PENDING for retry.`,
      );
      return;
    }

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
      this.logger.log(
        `[RefundService] Payment ${paymentId} already REFUNDED in DB — skipping duplicate.`,
      );
      return;
    }

    this.logger.log(
      `[RefundService] Refund completed for order ${orderNumber} (payment ${paymentId}).`,
    );

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
        details: {
          orderId,
          orderNumber,
          gatewayRef,
          amount: orderTotal.toFixed(2),
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record refund audit log: ${(err as Error).message}`,
        );
      });
  }

  /** Verifies that the payment belongs to the given order before mock-completion. */
  async processMockComplete(
    paymentId: string,
    orderId: string,
    outcome: 'succeeded' | 'failed',
    failureReason?: string,
  ): Promise<{ paymentId: string; orderId: string; outcome: string }> {
    const payment = await this.paymentDb.findByIdAndOrderId(paymentId, orderId);

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    return { paymentId: payment.id, orderId, outcome };
  }
}
