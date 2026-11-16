import { Injectable, Logger } from '@nestjs/common';
import { buildMeta } from '../../common/pagination';
import { AuditDbService } from './audit.db.service';
import { AuditQueryDto } from './dto';
import { toAuditLogResponse } from './mappers';
import { IAuditLogListResponse, ICreateAuditData } from './types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditDb: AuditDbService) {}

  /**
   * Fire-and-forget audit logger used across all domain modules.
   * Never throws: any persistence error is logged so the caller's main flow never fails.
   * Verified against docs: 01 §2.7, 11 §6.
   */
  async log(data: ICreateAuditData): Promise<void> {
    try {
      await this.auditDb.create(data);
      this.logger.log(
        `Audit logged: ${data.action} on ${data.entityType} (ID: ${data.entityId ?? 'N/A'}) by ${data.actorType ?? 'USER'} (${data.actorId ?? 'N/A'})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to write audit log to database: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Admin: Paginated list of today's audit logs filtered by entityType and/or actorType.
   * Verified against docs: 01 §2.7, 01 §22.6.
   */
  async findAll(query: AuditQueryDto): Promise<IAuditLogListResponse> {
    const { data, total, page, limit } = await this.auditDb.findMany(query);
    return {
      data: data.map(toAuditLogResponse),
      meta: buildMeta(total, page, limit),
    };
  }
}
