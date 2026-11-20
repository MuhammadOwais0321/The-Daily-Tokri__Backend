import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationModule } from '../notification/notification.module';
import { BatchController } from './batch.controller';
import { BatchDbService } from './batch.db.service';
import { BatchService } from './batch.service';
import { BatchExpiryCron } from './cron/batch-expiry.cron';

@Module({
  imports: [AuditModule, NotificationModule, forwardRef(() => InventoryModule)],
  controllers: [BatchController],
  providers: [BatchService, BatchDbService, BatchExpiryCron],
  exports: [BatchService, BatchDbService],
})
export class BatchModule {}
