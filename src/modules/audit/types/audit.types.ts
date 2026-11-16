import { AuditActorType, Prisma } from '@prisma/client';
import { PaginationMeta } from '../../../common/pagination';

export interface ICreateAuditData {
  entityType: string;
  entityId?: string | null;
  action: string;
  actorType?: AuditActorType;
  actorId?: string | null;
  details?: Record<string, unknown> | null;
}

export interface IAuditLogResponse {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  actorType: AuditActorType;
  actorId: string | null;
  details: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface IAuditLogListResponse {
  data: IAuditLogResponse[];
  meta: PaginationMeta;
}
