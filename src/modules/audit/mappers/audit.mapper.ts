import { AuditLog } from '@prisma/client';
import { IAuditLogResponse } from '../types';

export function toAuditLogResponse(log: AuditLog): IAuditLogResponse {
  return {
    id: log.id,
    entityType: log.entityType,
    entityId: log.entityId ?? null,
    action: log.action,
    actorType: log.actorType,
    actorId: log.actorId ?? null,
    details: log.details ?? null,
    createdAt: log.createdAt,
  };
}
