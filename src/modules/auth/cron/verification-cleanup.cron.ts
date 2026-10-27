import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserDbService } from '../../user/user.db.service';

@Injectable()
export class VerificationCleanupCron {
  private readonly logger = new Logger(VerificationCleanupCron.name);

  constructor(private readonly userDbService: UserDbService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup() {
    this.logger.log('Running hourly cleanup of expired verification codes...');
    try {
      const result =
        await this.userDbService.deleteExpiredOrUsedVerificationCodes();
      if (result.count > 0) {
        this.logger.log(
          `Deleted ${result.count} expired/used verification code record(s).`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to clean up expired verification codes', error);
    }
  }
}
