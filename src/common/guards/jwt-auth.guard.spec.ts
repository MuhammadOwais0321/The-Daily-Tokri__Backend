/* eslint-disable @typescript-eslint/unbound-method */
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from '../../modules/auth/auth.service';

describe('JwtAuthGuard (Point 2.1 Specification Tests)', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let jwtService: jest.Mocked<JwtService>;
  let authService: jest.Mocked<AuthService>;
  let configService: jest.Mocked<ConfigService>;

  const mockContext = (
    headers: Record<string, any> = {},
    handler = {},
    controllerClass = {},
  ) => {
    const request: Record<string, any> = { headers };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => handler,
      getClass: () => controllerClass,
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    jwtService = {
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    authService = {
      findAuthUser: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    configService = {
      getOrThrow: jest
        .fn()
        .mockReturnValue('validated-test-jwt-secret-key-32chars'),
      get: jest.fn().mockReturnValue('validated-test-jwt-secret-key-32chars'),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new JwtAuthGuard(reflector, jwtService, authService, configService);
  });

  describe('Step 1: Public route bypass', () => {
    it('should immediately allow request if route is marked @Public()', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(true); // IS_PUBLIC_KEY = true

      const context = mockContext({});
      const canActivate = await guard.canActivate(context);

      expect(canActivate).toBe(true);
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
      expect(authService.findAuthUser).not.toHaveBeenCalled();
    });

    it('should allow public route even with invalid or absent authorization header', async () => {
      reflector.getAllAndOverride.mockReturnValueOnce(true);

      const context = mockContext({ authorization: 'invalid-garbage' });
      const canActivate = await guard.canActivate(context);

      expect(canActivate).toBe(true);
    });
  });

  describe('Step 2: Authorization header presence check', () => {
    beforeEach(() => {
      reflector.getAllAndOverride.mockReturnValue(false); // Not public
    });

    it('should throw 401 "Authorization header missing" when authorization header is absent', async () => {
      const context = mockContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Authorization header missing'),
      );
    });

    it('should throw 401 "Authorization header missing" when header is empty string', async () => {
      const context = mockContext({ authorization: '   ' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Authorization header missing'),
      );
    });
  });

  describe('Step 3: Bearer token format check', () => {
    beforeEach(() => {
      reflector.getAllAndOverride.mockReturnValue(false);
    });

    it('should throw 401 "Invalid authorization header format" when scheme is not Bearer', async () => {
      const context = mockContext({ authorization: 'Basic dXNlcjpwYXNz' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid authorization header format'),
      );
    });

    it('should throw 401 "Invalid authorization header format" when token string is missing', async () => {
      const context = mockContext({ authorization: 'Bearer' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid authorization header format'),
      );
    });

    it('should throw 401 "Invalid authorization header format" when extra parts are present', async () => {
      const context = mockContext({ authorization: 'Bearer token1 token2' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid authorization header format'),
      );
    });
  });

  describe('Step 4: JWT secret verification & expiry', () => {
    beforeEach(() => {
      reflector.getAllAndOverride.mockReturnValue(false);
    });

    it('should throw 401 "Token has expired. Please login again." when token is expired', async () => {
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';
      jwtService.verifyAsync.mockRejectedValueOnce(expiredError);

      const context = mockContext({
        authorization: 'Bearer expired.jwt.token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Token has expired. Please login again.'),
      );
    });

    it('should throw 401 "Invalid authentication token" when token signature is invalid', async () => {
      const invalidError = new Error('invalid signature');
      invalidError.name = 'JsonWebTokenError';
      jwtService.verifyAsync.mockRejectedValueOnce(invalidError);

      const context = mockContext({
        authorization: 'Bearer invalid.signature.token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid authentication token'),
      );
    });

    it('should throw 401 "Invalid authentication token" when payload has no sub (userId)', async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({ role: 'CUSTOMER' }); // missing sub

      const context = mockContext({ authorization: 'Bearer valid.but.nosub' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid authentication token'),
      );
    });

    it('should retrieve JWT_SECRET via ConfigService without fallback', async () => {
      configService.getOrThrow.mockReturnValueOnce('custom-configured-secret');
      jwtService.verifyAsync.mockResolvedValueOnce({ sub: 'user-1' });
      authService.findAuthUser.mockResolvedValueOnce({
        id: 'user-1',
        name: 'User 1',
        email: 'user1@example.com',
        role: 'CUSTOMER',
        isActive: true,
      });

      const context = mockContext({ authorization: 'Bearer some.token' });
      await guard.canActivate(context);

      expect(configService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('some.token', {
        secret: 'custom-configured-secret',
      });
    });
  });

  describe('Step 5: Database user lookup', () => {
    beforeEach(() => {
      reflector.getAllAndOverride.mockReturnValue(false);
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-uuid-123',
        role: 'CUSTOMER',
      });
    });

    it('should throw 401 "User not found" when user does not exist in DB', async () => {
      authService.findAuthUser.mockResolvedValueOnce(null);

      const context = mockContext({ authorization: 'Bearer valid.token' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
      expect(authService.findAuthUser).toHaveBeenCalledWith('user-uuid-123');
    });
  });

  describe('Step 6: User isActive check', () => {
    beforeEach(() => {
      reflector.getAllAndOverride.mockReturnValue(false);
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-uuid-123',
        role: 'CUSTOMER',
      });
    });

    it('should throw 403 "User account is deactivated. Please contact support." when isActive is false', async () => {
      authService.findAuthUser.mockResolvedValueOnce({
        id: 'user-uuid-123',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'CUSTOMER',
        isActive: false, // Deactivated!
      });

      const context = mockContext({ authorization: 'Bearer valid.token' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new ForbiddenException(
          'User account is deactivated. Please contact support.',
        ),
      );
    });
  });

  describe('Step 7: Role DB verification & @Roles check', () => {
    beforeEach(() => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-uuid-123',
        role: 'ADMIN', // Token claims ADMIN!
      });
    });

    it('should check role from DB user object, NOT from token payload, and throw 403 if role mismatch', async () => {
      // In DB, user role is CUSTOMER even though token claims ADMIN
      authService.findAuthUser.mockResolvedValueOnce({
        id: 'user-uuid-123',
        name: 'Tampered Token User',
        email: 'tampered@example.com',
        role: 'CUSTOMER',
        isActive: true,
      });

      // Route requires ADMIN
      reflector.getAllAndOverride
        .mockReturnValueOnce(false) // isPublic = false
        .mockReturnValueOnce(['ADMIN']); // requiredRoles = ['ADMIN']

      const context = mockContext({ authorization: 'Bearer valid.token' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new ForbiddenException('Insufficient permissions'),
      );
    });

    it('should allow request when DB user role matches required role', async () => {
      authService.findAuthUser.mockResolvedValueOnce({
        id: 'user-admin-uuid',
        name: 'Real Admin',
        email: 'admin@example.com',
        role: 'ADMIN',
        isActive: true,
      });

      reflector.getAllAndOverride
        .mockReturnValueOnce(false) // isPublic = false
        .mockReturnValueOnce(['ADMIN']); // requiredRoles = ['ADMIN']

      const requestObj: Record<string, any> = {
        headers: { authorization: 'Bearer admin.token' },
      };
      const context = {
        switchToHttp: () => ({
          getRequest: () => requestObj,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(requestObj.user).toEqual({
        id: 'user-admin-uuid',
        name: 'Real Admin',
        email: 'admin@example.com',
        role: 'ADMIN',
        isActive: true,
      });
      expect(requestObj.dbUser).toEqual(requestObj.user);
    });

    it('should allow request when route has no role restrictions', async () => {
      authService.findAuthUser.mockResolvedValueOnce({
        id: 'user-uuid-123',
        name: 'Regular Customer',
        email: 'customer@example.com',
        role: 'CUSTOMER',
        isActive: true,
      });

      reflector.getAllAndOverride
        .mockReturnValueOnce(false) // isPublic = false
        .mockReturnValueOnce(undefined); // no required roles

      const requestObj: Record<string, any> = {
        headers: { authorization: 'Bearer customer.token' },
      };
      const context = {
        switchToHttp: () => ({
          getRequest: () => requestObj,
          getResponse: () => ({}),
          getNext: () => ({}),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(requestObj.user).toBeDefined();
    });
  });
});
