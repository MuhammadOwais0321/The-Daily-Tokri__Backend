import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditDbService } from '../audit.db.service';

const DEFAULT_AUDIT_RETENTION_DAYS = 90;

/** Daily cron job that purges audit logs older than `AUDIT_RETENTION_DAYS` (default 90 days / ~3 months). */
@Injectable()
export class AuditRetentionCron {
  private readonly logger = new Logger(AuditRetentionCron.name);

  constructor(
    private readonly auditDb: AuditDbService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleRetentionCleanup(): Promise<void> {
    const rawRetention = this.configService.get<number>('AUDIT_RETENTION_DAYS');
    const parsedRetention = Number(rawRetention);
    const retentionDays =
      Number.isFinite(parsedRetention) && parsedRetention > 0
        ? parsedRetention
        : DEFAULT_AUDIT_RETENTION_DAYS;

    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    try {
      const purgedCount = await this.auditDb.deleteOlderThan(cutoffDate);

      if (purgedCount > 0) {
        this.logger.log(
          `[AuditRetentionCron] Purged ${purgedCount} audit log(s) older than ${retentionDays} day(s) (cutoff: ${cutoffDate.toISOString()}).`,
        );
      }
    } catch (err) {
      this.logger.error(
        `[AuditRetentionCron] Failed to purge expired audit logs: ${(err as Error).message}`,
      );
    }
  }
}
