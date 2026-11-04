import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';

@Roles(UserRole.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(@Query() query: AuditQueryDto) {
    return this.auditService.findAll(query);
  }
}
