import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateAuditDto } from './dto/create-audit.dto';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditActorType } from '../../common/enums';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditDbService {
  constructor(private readonly db: DatabaseService) {}

  async create(dto: CreateAuditDto) {
    return this.db.auditLog.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId ?? null,
        action: dto.action,
        actorType: dto.actorType ?? AuditActorType.USER,
        actorId: dto.actorId ?? null,
        details: (dto.details ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }

  async findMany(query: AuditQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.entityType) {
      where.entityType = query.entityType;
    }

    if (query.actorType) {
      where.actorType = query.actorType;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

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
  }
}
