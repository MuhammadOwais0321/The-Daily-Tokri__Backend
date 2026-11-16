import { Prisma, User, UserPreference } from '@prisma/client';
import { toDecimalString } from '../../../common/utils/decimal';
import { stripDeletedEmailPrefix } from '../../auth/mappers/auth.mapper';
import {
  IUserPreferenceResponse,
  IUserProfileResponse,
  IUserStatsResponse,
  UserProfileResponse,
} from '../types';

export type { UserProfileResponse };

/**
 * Maps a User record to a safe profile response.
 * Never includes `passwordHash` and always strips the `[DELETED] <id>:` prefix from anonymized emails.
 * Verified against docs: 01 §6, 04 §7, 06 §4, 10 §3.
 */
export function toUserProfileResponse(user: User): IUserProfileResponse {
  return {
    id: user.id,
    name: user.name,
    email: stripDeletedEmailPrefix(user.email),
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    totalOrders: user.totalOrders,
    totalSpent: toDecimalString(user.totalSpent),
    lastLoginAt: user.lastLoginAt ?? null,
    deletedAt: user.deletedAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toUserStatsResponse(stats: {
  totalOrders: number;
  totalSpent: Prisma.Decimal;
  avgRating: number;
}): IUserStatsResponse {
  return {
    totalOrders: stats.totalOrders,
    totalSpent: toDecimalString(stats.totalSpent),
    avgRating: stats.avgRating,
  };
}

export function toUserPreferenceResponse(
  pref: UserPreference,
): IUserPreferenceResponse {
  return {
    id: pref.id,
    userId: pref.userId,
    pushNotification: pref.pushNotification,
    emailNotification: pref.emailNotification,
    createdAt: pref.createdAt,
    updatedAt: pref.updatedAt,
  };
}
