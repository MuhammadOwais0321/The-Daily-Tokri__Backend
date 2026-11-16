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

/** Maps a user entity to `IUserProfileResponse` (excludes `passwordHash` and strips anonymized email prefixes). */
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
