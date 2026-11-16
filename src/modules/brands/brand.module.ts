import { Module } from '@nestjs/common';
import { S3Service } from '../../common/services/s3.service';
import { DatabaseModule } from '../../database';
import { AuditModule } from '../audit/audit.module';
import { BrandController } from './brand.controller';
import { BrandDbService } from './brand.db.service';
import { BrandService } from './brand.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [BrandController],
  providers: [BrandService, BrandDbService, S3Service],
  exports: [BrandService, BrandDbService],
})
export class BrandModule {}
