import { Module } from '@nestjs/common';
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
  ],
  exports: [NotificationService, NotificationDbService],
})
export class NotificationModule {}
