import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentDbService } from '../payment.db.service';
import { RefundService } from '../services/refund.service';

/**
 * Runs every 5 minutes and retries refunds for orders stuck in REFUND_PENDING.
 *
 * This handles the case where:
 *   a) The post-commit gateway refund call failed (network blip, gateway down)
 *   b) The refund call was never reached (process crash after DB commit)
 *   c) A late payment succeeded on a cancelled order → auto-refund path
 *
 * Idempotency is guaranteed by processRefundInTx's guarded updateMany (PAID → REFUNDED).
 * Verified against docs: 01 §20, 11 §6.
 */
@Injectable()
export class RefundRetryCron {
  private readonly logger = new Logger(RefundRetryCron.name);

  constructor(
    private readonly paymentDb: PaymentDbService,
    private readonly refundService: RefundService,
  ) {}

  @Cron('*/5 * * * *') // Every 5 minutes
  async handleRefundRetry(): Promise<void> {
    let pendingOrders: Awaited<ReturnType<PaymentDbService['findRefundPendingOrders']>>;

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
