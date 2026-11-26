import { Controller, Get, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto';

@SkipThrottle()
@Roles(UserRole.ADMIN)
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** Lists audit logs with optional search, entityType, action, actorType, and date range filters. */
  @Get()
  findAll(@Query() query: AuditQueryDto) {
    return this.auditService.findAll(query);
  }
}
