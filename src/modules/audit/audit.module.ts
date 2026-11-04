import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditDbService } from './audit.db.service';
import { AuditController } from './audit.controller';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditDbService],
  exports: [AuditService, AuditDbService],
})
export class AuditModule {}
