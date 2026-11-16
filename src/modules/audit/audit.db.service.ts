import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AuditActorType, AuditLog, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { AuditQueryDto } from './dto';
import { ICreateAuditData } from './types';

@Injectable()
export class AuditDbService {
  private readonly logger = new Logger(AuditDbService.name);

  constructor(private readonly db: DatabaseService) {}

  private getTodayUtcRange(): { start: Date; end: Date } {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    return {
      start: new Date(Date.UTC(year, month, day, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year, month, day, 23, 59, 59, 999)),
    };
  }

  /**
   * Persists a single audit log entry.
   */
  async create(data: ICreateAuditData): Promise<AuditLog> {
    return this.db.auditLog.create({
      data: {
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        action: data.action,
        actorType: data.actorType ?? AuditActorType.USER,
        actorId: data.actorId ?? null,
        details: (data.details ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Retrieves today's audit activity (UTC day boundary) with optional entityType and actorType filters.
   * Uses `@@index([createdAt])` and `@@index([entityType, entityId])` for fast bounded queries.
   * Verified against docs: 01 §2.7, 01 §22.6, 03 §1.
   */
  async findMany(query: AuditQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const { start, end } = this.getTodayUtcRange();

    const where: Prisma.AuditLogWhereInput = {
      createdAt: {
        gte: start,
        lte: end,
      },
    };

    if (query.entityType) {
      where.entityType = {
        equals: query.entityType,
        mode: 'insensitive',
      };
    }

    if (query.actorType) {
      where.actorType = query.actorType;
    }

    try {
      const [data, total] = await Promise.all([
        this.db.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.auditLog.count({ where }),
      ]);

      return { data, total, page, limit };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve audit logs: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException('Failed to retrieve audit logs');
    }
  }
}
