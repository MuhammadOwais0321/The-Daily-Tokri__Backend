import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { AuditController } from './audit.controller';
import { AuditDbService } from './audit.db.service';
import { AuditService } from './audit.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuditController],
  providers: [AuditService, AuditDbService],
  exports: [AuditService, AuditDbService],
})
export class AuditModule {}
