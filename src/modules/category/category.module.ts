import { Module } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryDbService } from './category.db.service';
import { CategoryController } from './category.controller';
import { AdminCategoryController } from './admin-category.controller';
import { S3Service } from '../../common/services/s3.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CategoryController, AdminCategoryController],
  providers: [CategoryService, CategoryDbService, S3Service],
  exports: [CategoryService, CategoryDbService, S3Service],
})
export class CategoryModule {}
