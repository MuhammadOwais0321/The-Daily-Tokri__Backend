import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { AuditModule } from '../audit/audit.module';
import { SupplierController } from './supplier.controller';
import { SupplierDbService } from './supplier.db.service';
import { SupplierService } from './supplier.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [SupplierController],
  providers: [SupplierService, SupplierDbService],
  exports: [SupplierService, SupplierDbService],
})
export class SupplierModule {}
