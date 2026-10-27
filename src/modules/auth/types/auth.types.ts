import { Request } from 'express';
import { UserRole } from '../../../common/enums';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole | string;
  isActive: boolean;
}

export interface JwtPayload {
  sub?: string;
  role?: UserRole | string;
  [key: string]: unknown;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  dbUser?: AuthUser;
}
