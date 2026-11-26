import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { buildMeta } from '../../common/pagination';
import { AuditDbService } from './audit.db.service';
import { AuditQueryDto } from './dto';
import { toAuditLogResponse } from './mappers';
import { IAuditLogListResponse, ICreateAuditData } from './types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditDb: AuditDbService) {}

  /** Fire-and-forget audit logger; catches and logs DB errors so callers never fail. */
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

  /** Returns a paginated list of audit logs with optional filters and date range. */
  async findAll(query: AuditQueryDto): Promise<IAuditLogListResponse> {
    if (query.dateFrom && query.dateTo) {
      const from = new Date(query.dateFrom);
      const to = new Date(query.dateTo);
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.dateTo)) {
        to.setUTCHours(23, 59, 59, 999);
      }
      if (from > to) {
        throw new BadRequestException('dateFrom must not be later than dateTo');
      }
    }

    const { data, total, page, limit } = await this.auditDb.findMany(query);
    return {
      data: data.map(toAuditLogResponse),
      meta: buildMeta(total, page, limit),
    };
  }
}
