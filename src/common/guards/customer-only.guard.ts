import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '../enums';
import { AuthenticatedRequest } from '../../modules/auth/types';

@Injectable()
export class CustomerOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user || request.dbUser;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException(
        'Only customers are allowed to access this resource',
      );
    }

    return true;
  }
}
