import { UserRole } from '@prisma/client';
import { PaginationMeta } from '../../../common/pagination';

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  phone?: string | null;
  role?: UserRole;
  isActive?: boolean;
  isEmailVerified?: boolean;
}

export interface IUserProfileResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  totalOrders: number;
  totalSpent: string;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserProfileResponse = IUserProfileResponse;

export interface IUserListResponse {
  data: IUserProfileResponse[];
  meta: PaginationMeta;
}

export interface IUserStatsResponse {
  totalOrders: number;
  totalSpent: string;
  avgRating: number;
}

export interface IUserPreferenceResponse {
  id: string;
  userId: string;
  pushNotification: boolean;
  emailNotification: boolean;
  createdAt: Date;
  updatedAt: Date;
}
