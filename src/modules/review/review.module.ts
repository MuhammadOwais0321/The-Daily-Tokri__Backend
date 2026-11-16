import { Module } from '@nestjs/common';
import { S3Service } from '../../common/services/s3.service';
import { DatabaseModule } from '../../database';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { AdminReviewController } from './admin-review.controller';
import { ReviewController } from './review.controller';
import { ReviewDbService } from './review.db.service';
import { ReviewService } from './review.service';

@Module({
  imports: [DatabaseModule, AuditModule, NotificationModule],
  controllers: [ReviewController, AdminReviewController],
  providers: [ReviewService, ReviewDbService, S3Service],
  exports: [ReviewService, ReviewDbService],
})
export class ReviewModule {}
