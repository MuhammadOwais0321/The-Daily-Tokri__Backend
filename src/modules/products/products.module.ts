import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsDbService } from './products.db.service';
import { ProductsController } from './products.controller';
import { AdminProductsController } from './admin-products.controller';
import { CategoryModule } from '../category/category.module';
import { AuditModule } from '../audit/audit.module';
import { S3Service } from '../../common/services/s3.service';

@Module({
  imports: [CategoryModule, AuditModule],
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsService, ProductsDbService, S3Service],
  exports: [ProductsService, ProductsDbService],
})
export class ProductsModule {}
