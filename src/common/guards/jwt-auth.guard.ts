import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthService } from '../../modules/auth/auth.service';
import { AuthenticatedRequest, JwtPayload } from '../../modules/auth/types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Agar route @Public() hai → foran allow.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // 2. Authorization header missing → 401 Authorization header missing.
    const rawAuthHeader =
      request.headers['authorization'] || request.headers['Authorization'];
    const authHeader: string | undefined = Array.isArray(rawAuthHeader)
      ? rawAuthHeader[0]
      : rawAuthHeader;

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.trim()) {
      throw new UnauthorizedException('Authorization header missing');
    }

    // 3. Bearer <token> format nahi → 401 Invalid authorization header format.
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      throw new UnauthorizedException('Invalid authorization header format');
    }
    const token = parts[1];

    let payload: JwtPayload;
    try {
      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      const err = error as { name?: string; message?: string };
      if (
        err?.name === 'TokenExpiredError' ||
        (typeof err?.message === 'string' &&
          err.message.toLowerCase().includes('expired'))
      ) {
        throw new UnauthorizedException(
          'Token has expired. Please login again.',
        );
      }
      throw new UnauthorizedException('Invalid authentication token');
    }

    if (!payload?.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid authentication token');
    }

    // 5. Token ke sub (userId) se DB user nikalo. Na mile → 401.
    const user = await this.authService.findAuthUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 6. isActive = false → 403 User account is deactivated. Please contact support.
    if (!user.isActive) {
      throw new ForbiddenException(
        'User account is deactivated. Please contact support.',
      );
    }

    // 7. Role DB se liya jata hai (token se nahi), phir route ke @Roles('ROLE') check.
    //    Fail → 403 Insufficient permissions.
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(user.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    // req.user aur req.dbUser attach karo
    request.user = user;
    request.dbUser = user;

    return true;
  }
}
