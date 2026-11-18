import { Module } from '@nestjs/common';
import { S3Service } from '../../common/services/s3.service';
import { DatabaseModule } from '../../database';
import { AuditModule } from '../audit/audit.module';
import { AdminBannerController } from './admin-banner.controller';
import { BannerController } from './banner.controller';
import { BannerDbService } from './banner.db.service';
import { BannerService } from './banner.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [BannerController, AdminBannerController],
  providers: [BannerService, BannerDbService, S3Service],
  exports: [BannerService, BannerDbService],
})
export class BannerModule {}
