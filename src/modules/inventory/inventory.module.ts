import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BatchModule } from '../batch/batch.module';
import { NotificationModule } from '../notification/notification.module';
import { ProductsModule } from '../products/products.module';
import { InventoryController } from './inventory.controller';
import { InventoryDbService } from './inventory.db.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    ProductsModule,
    AuditModule,
    NotificationModule,
    forwardRef(() => BatchModule),
  ],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryDbService],
  exports: [InventoryService, InventoryDbService],
})
export class InventoryModule {}
