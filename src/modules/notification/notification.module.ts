import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationDbService } from './notification.db.service';
import { NotificationService } from './notification.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationDbService],
  exports: [NotificationService],
})
export class NotificationModule {}
