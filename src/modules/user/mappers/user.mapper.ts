import { User } from '@prisma/client';
import { stripDeletedEmailPrefix } from '../../auth/mappers/auth.mapper';

export interface UserProfileResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  totalOrders: number;
  totalSpent: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toUserProfileResponse(user: User): UserProfileResponse {
  return {
    id: user.id,
    name: user.name,
    email: stripDeletedEmailPrefix(user.email),
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    totalOrders: user.totalOrders,
    totalSpent: user.totalSpent.toString(),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
