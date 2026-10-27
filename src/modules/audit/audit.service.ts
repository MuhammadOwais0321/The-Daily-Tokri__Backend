import { Injectable, Logger } from '@nestjs/common';
import { CreateAuditDto } from './dto/create-audit.dto';
import { AuditQueryDto } from './dto/audit-query.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  async log(createAuditDto: CreateAuditDto): Promise<void> {
    // Fire-and-forget logging: do not let audit failure crash the caller
    try {
      this.logger.log(
        `Audit log: ${createAuditDto.action} on ${createAuditDto.entityType}`,
      );
    } catch (error) {
      this.logger.error('Failed to write audit log', error);
    }
  }

  findAll(query: AuditQueryDto) {
    return { logs: [], total: 0, query };
  }
}
