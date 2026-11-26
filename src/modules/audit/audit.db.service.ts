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

  /** Persists a single audit log entry. */
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

  /** Queries audit logs with optional search, entityType, action, actorType, and date range filters. */
  async findMany(query: AuditQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const toDate = new Date(query.dateTo);
        // If only YYYY-MM-DD was provided, include the entire day up to 23:59:59.999Z
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.dateTo)) {
          toDate.setUTCHours(23, 59, 59, 999);
        }
        where.createdAt.lte = toDate;
      }
    }

    if (query.entityType) {
      where.entityType = {
        equals: query.entityType,
        mode: 'insensitive',
      };
    }

    if (query.action) {
      where.action = {
        contains: query.action,
        mode: 'insensitive',
      };
    }

    if (query.entityId) {
      where.entityId = query.entityId;
    }

    if (query.actorId) {
      where.actorId = query.actorId;
    }

    if (query.actorType) {
      where.actorType = query.actorType;
    }

    if (query.q?.trim()) {
      const term = query.q.trim();
      where.OR = [
        { action: { contains: term, mode: 'insensitive' } },
        { entityType: { contains: term, mode: 'insensitive' } },
        { entityId: { contains: term, mode: 'insensitive' } },
        { actorId: { contains: term, mode: 'insensitive' } },
      ];
    }

    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    try {
      const [data, total] = await Promise.all([
        this.db.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: sortOrder },
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

  /** Deletes audit logs created strictly before `cutoffDate`. */
  async deleteOlderThan(cutoffDate: Date): Promise<number> {
    const result = await this.db.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }
}
