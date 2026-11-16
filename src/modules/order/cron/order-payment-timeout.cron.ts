import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderDbService } from '../order.db.service';
import { OrderCancellationService } from '../services/order-cancellation.service';

/**
 * Every-minute cron job that auto-cancels expired unpaid `PENDING` orders and restores stock.
 */
@Injectable()
export class OrderPaymentTimeoutCron {
  private readonly logger = new Logger(OrderPaymentTimeoutCron.name);

  constructor(
    private readonly orderDb: OrderDbService,
    private readonly cancellationService: OrderCancellationService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handlePaymentTimeoutSweep(): Promise<void> {
    const now = new Date();
    try {
      const expiredOrders = await this.orderDb.findExpiredPendingOrders(
        now,
        50,
      );

      if (expiredOrders.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${expiredOrders.length} expired pending order(s) to auto-cancel.`,
      );

      let cancelledCount = 0;
      for (const order of expiredOrders) {
        try {
          await this.cancellationService.cancelSystemTimeoutOrder(order);
          cancelledCount++;
        } catch (err) {
          // Skip gracefully if the order transitioned concurrently
          this.logger.warn(
            `Skipping auto-cancel for order ${order.orderNumber} (${order.id}): ${(err as Error).message}`,
          );
        }
      }

      if (cancelledCount > 0) {
        this.logger.log(
          `Successfully auto-cancelled ${cancelledCount} expired unpaid order(s).`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to run payment timeout sweep: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
