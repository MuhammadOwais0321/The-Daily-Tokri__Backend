import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { AuditController } from './audit.controller';
import { AuditDbService } from './audit.db.service';
import { AuditService } from './audit.service';
import { AuditRetentionCron } from './cron';

@Module({
  imports: [DatabaseModule],
  controllers: [AuditController],
  providers: [AuditService, AuditDbService, AuditRetentionCron],
  exports: [AuditService, AuditDbService, AuditRetentionCron],
})
export class AuditModule {}
