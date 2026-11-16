import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentDbService } from '../payment.db.service';
import { RefundService } from '../services/refund.service';

/**
 * Scheduled job (every 5 minutes) that retries refunds for orders in `REFUND_PENDING` status.
 */
@Injectable()
export class RefundRetryCron {
  private readonly logger = new Logger(RefundRetryCron.name);

  constructor(
    private readonly paymentDb: PaymentDbService,
    private readonly refundService: RefundService,
  ) {}

  @Cron('*/5 * * * *')
  async handleRefundRetry(): Promise<void> {
    let pendingOrders: Awaited<
      ReturnType<PaymentDbService['findRefundPendingOrders']>
    >;

    try {
      pendingOrders = await this.paymentDb.findRefundPendingOrders(20);
    } catch (err) {
      this.logger.error(
        `[RefundRetryCron] Failed to query REFUND_PENDING orders: ${(err as Error).message}`,
      );
      return;
    }

    if (pendingOrders.length === 0) {
      return;
    }

    this.logger.log(
      `[RefundRetryCron] Found ${pendingOrders.length} REFUND_PENDING order(s) to retry.`,
    );

    let successCount = 0;

    for (const order of pendingOrders) {
      const payment = order.payments[0];

      if (!payment) {
        this.logger.warn(
          `[RefundRetryCron] Order ${order.orderNumber} (${order.id}) is REFUND_PENDING but has no PAID payment — skipping.`,
        );
        continue;
      }

      try {
        await this.refundService.processRefund(
          order.id,
          order.orderNumber,
          order.userId,
          payment.id,
          payment.gatewayRef,
          order.total,
          !!order.confirmedAt,
        );
        successCount++;
      } catch (err) {
        // Log and continue — do not let one failure break others
        this.logger.error(
          `[RefundRetryCron] Refund retry failed for order ${order.orderNumber}: ${(err as Error).message}`,
        );
      }
    }

    if (successCount > 0) {
      this.logger.log(
        `[RefundRetryCron] Successfully processed ${successCount} refund(s).`,
      );
    }
  }
}
