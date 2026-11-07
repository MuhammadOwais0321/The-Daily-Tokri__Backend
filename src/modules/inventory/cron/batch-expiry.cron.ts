import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InventoryService } from '../inventory.service';

@Injectable()
export class BatchExpiryCron {
  private readonly logger = new Logger(BatchExpiryCron.name);

  constructor(private readonly inventoryService: InventoryService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleBatchExpiry(): Promise<void> {
    this.logger.log('Running scheduled batch expiry check (every 5 minutes)...');
    try {
      const result = await this.inventoryService.processBatchExpiry();
      if (result.processed > 0) {
        this.logger.log(
          `Batch expiry sweep completed: ${result.processed} batch(es) marked EXPIRED [${result.expiredBatches.join(', ')}].`,
        );
      } else {
        this.logger.debug(
          'Batch expiry sweep completed: No expired batches found.',
        );
      }
    } catch (error) {
      this.logger.error('Failed to run batch expiry sweep', error);
    }
  }
}
