import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationDbService } from '../notification.db.service';

/**
 * Periodically purges old notifications exceeding the retention threshold.
 * Runs daily at midnight.
 * Default retention is 30 days, configurable via NOTIFICATION_RETENTION_DAYS.
 * Verified against docs: 01 §22.3, 02 §2.4.
 */
@Injectable()
export class NotificationRetentionCron {
  private readonly logger = new Logger(NotificationRetentionCron.name);

  constructor(
    private readonly notificationDb: NotificationDbService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleRetentionCleanup(): Promise<void> {
    const rawRetention = this.configService.get<number>(
      'NOTIFICATION_RETENTION_DAYS',
    );
    const retentionDays = Number(rawRetention) || 30;

    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    try {
      const purgedCount = await this.notificationDb.deleteOlderThan(cutoffDate);

      if (purgedCount > 0) {
        this.logger.log(
          `[NotificationRetentionCron] Purged ${purgedCount} notifications older than ${retentionDays} day(s) (cutoff: ${cutoffDate.toISOString()}).`,
        );
      }
    } catch (err) {
      this.logger.error(
        `[NotificationRetentionCron] Failed to purge expired notifications: ${(err as Error).message}`,
      );
    }
  }
}
