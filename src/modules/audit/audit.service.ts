import { Injectable, Logger } from '@nestjs/common';
import { CreateAuditDto } from './dto/create-audit.dto';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditDbService } from './audit.db.service';
import { buildMeta } from '../../common/pagination';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditDb: AuditDbService) {}

  async log(createAuditDto: CreateAuditDto): Promise<void> {
    // Fire-and-forget logging: do not let audit failure crash the caller
    try {
      await this.auditDb.create(createAuditDto);
      this.logger.log(
        `Audit logged: ${createAuditDto.action} on ${createAuditDto.entityType} (ID: ${createAuditDto.entityId ?? 'N/A'}) by ${createAuditDto.actorType ?? 'USER'} (${createAuditDto.actorId ?? 'N/A'})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to write audit log to database: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  async findAll(query: AuditQueryDto) {
    const { data, total, page, limit } = await this.auditDb.findMany(query);
    return {
      data,
      meta: buildMeta(total, page, limit),
    };
  }
}
