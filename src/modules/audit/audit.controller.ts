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

  /** Lists today's audit logs with optional entityType and actorType filters. */
  @Get()
  findAll(@Query() query: AuditQueryDto) {
    return this.auditService.findAll(query);
  }
}
