import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryDbService } from './inventory.db.service';
import { InventoryController } from './inventory.controller';
import { ProductsModule } from '../products/products.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { BatchExpiryCron } from './cron/batch-expiry.cron';

@Module({
  imports: [ProductsModule, AuditModule, NotificationModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryDbService, BatchExpiryCron],
  exports: [InventoryService, InventoryDbService],
})
export class InventoryModule {}
