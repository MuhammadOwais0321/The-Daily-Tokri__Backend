import { Module } from '@nestjs/common';
import { EmailService } from '../../common/services/email.service';
import { DatabaseModule } from '../../database';
import { NotificationRetentionCron } from './cron';
import { NotificationController } from './notification.controller';
import { NotificationDbService } from './notification.db.service';
import { NotificationService } from './notification.service';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationDbService,
    NotificationRetentionCron,
    EmailService,
  ],
  exports: [NotificationService, NotificationDbService],
})
export class NotificationModule {}
