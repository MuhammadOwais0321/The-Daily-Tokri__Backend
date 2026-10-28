import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, VerificationType } from '@prisma/client';
import type { Request, Response, CookieOptions } from 'express';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { PasswordService } from './password.service';
import { UserDbService } from '../user/user.db.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../../common/services/email.service';
import { AuditActorType } from '../../common/enums';
import { toSafeUser } from './mappers/auth.mapper';
import { AuthUser, JwtPayload } from './types';

export type { AuthUser };

function parseDurationToMs(duration: string | number): number {
  if (typeof duration === 'number') {
    return duration;
  }
  const match = duration.trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    const parsed = parseInt(duration, 10);
    return !isNaN(parsed) ? parsed * 1000 : 7 * 24 * 60 * 60 * 1000;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userDbService: UserDbService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async findAuthUser(userId: string): Promise<AuthUser | null> {
    const user = await this.userDbService.findUserById(userId);
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
    };
  }

  async register(registerDto: RegisterDto) {
    // 1. Check duplicate email
    const existingEmail = await this.userDbService.findUserByEmail(
      registerDto.email,
    );
    if (existingEmail) {
      throw new ConflictException(
        'This email is already associated with another account.',
      );
    }

    // 2. Clean phone: empty or whitespace becomes null so DB unique constraint is preserved
    const cleanedPhone = registerDto.phone?.trim()
      ? registerDto.phone.trim()
      : null;

    // 3. Check duplicate phone only if a valid non-empty phone is provided
    if (cleanedPhone) {
      const existingPhone =
        await this.userDbService.findUserByPhone(cleanedPhone);
      if (existingPhone) {
        throw new ConflictException(
          'This mobile number is already associated with another account.',
        );
      }
    }

    // 4. Hash password via PasswordService (bcrypt cost 12)
    const passwordHash = await this.passwordService.hashPassword(
      registerDto.password,
    );

    // 5. Create user with role CUSTOMER, isActive true, isEmailVerified false
    const user = await this.userDbService.createUser({
      name: registerDto.name,
      email: registerDto.email,
      passwordHash,
      phone: cleanedPhone,
      role: UserRole.CUSTOMER,
      isActive: true,
      isEmailVerified: false,
    });

    // 6. Generate 6-digit OTP code, hash it, store in verification_codes
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const hashedCode = await this.passwordService.hashPassword(code);

    await this.userDbService.deleteVerificationCodesByEmail(
      user.email,
      VerificationType.EMAIL_VERIFICATION,
    );

    await this.userDbService.createVerificationCode({
      email: user.email,
      code: hashedCode,
      expiresAt,
      userId: user.id,
      type: VerificationType.EMAIL_VERIFICATION,
    });

    // 7. Send email with verification code (same logic as reset password)
    const isEmailSent = await this.emailService.sendVerificationCode(
      user.email,
      code,
      'Email Verification',
    );
    if (!isEmailSent) {
      this.logger.warn(`Failed to send verification email to ${user.email}`);
    }

    // 8. Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'USER',
        entityId: user.id,
        action: 'REGISTER',
        actorType: AuditActorType.USER,
        actorId: user.id,
        details: { email: user.email, role: user.role },
      })
      .catch((err) => {
        this.logger.error('Failed to log registration audit event', err);
      });

    // 9. Return response
    return {
      message:
        'Registration successful. Please verify your email with the verification code sent to your inbox.',
      user: toSafeUser(user),
    };
  }

  getRefreshTokenCookieOptions(): CookieOptions {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const duration =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const maxAge = parseDurationToMs(duration);

    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
      maxAge,
    };
  }

  setRefreshTokenCookie(res: Response, refreshToken: string): void {
    const options = this.getRefreshTokenCookieOptions();
    res.cookie('refreshToken', refreshToken, options);
  }

  clearRefreshTokenCookie(res: Response): void {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
    });
  }

  async generateTokens(user: { id: string; role: UserRole | string }) {
    const accessSecret = this.configService.getOrThrow<string>('JWT_SECRET');
    const accessExpiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') ?? '15m';

    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    const refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: user.id, role: user.role, tokenType: 'access' },
        {
          secret: accessSecret,
          expiresIn: accessExpiresIn as
            | `${number}${'s' | 'm' | 'h' | 'd'}`
            | number,
        },
      ),
      this.jwtService.signAsync(
        { sub: user.id, role: user.role, tokenType: 'refresh' },
        {
          secret: refreshSecret,
          expiresIn: refreshExpiresIn as
            | `${number}${'s' | 'm' | 'h' | 'd'}`
            | number,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  async login(loginDto: LoginDto, res?: Response) {
    const user = await this.userDbService.findUserByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.passwordService.comparePassword(
      loginDto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException(
        'User account is deactivated. Please contact support.',
      );
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Please verify your email address before logging in.',
      );
    }

    const { accessToken, refreshToken } = await this.generateTokens(user);

    if (res) {
      this.setRefreshTokenCookie(res, refreshToken);
    }

    await this.userDbService.updateLastLogin(user.id);

    this.auditService
      .log({
        entityType: 'USER',
        entityId: user.id,
        action: 'LOGIN',
        actorType: AuditActorType.USER,
        actorId: user.id,
        details: { email: user.email, role: user.role },
      })
      .catch((err) => {
        this.logger.error('Failed to log login audit event', err);
      });

    return {
      accessToken,
      user: toSafeUser(user),
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userDbService.findUserByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('User with this email does not exist');
    }

    if (!user.isActive) {
      throw new ForbiddenException(
        'User account is deactivated. Please contact support.',
      );
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const hashedCode = await this.passwordService.hashPassword(code);

    await this.userDbService.deleteVerificationCodesByEmail(
      dto.email,
      VerificationType.RESET_PASSWORD,
    );

    await this.userDbService.createVerificationCode({
      email: dto.email,
      code: hashedCode,
      expiresAt,
      userId: user.id,
      type: VerificationType.RESET_PASSWORD,
    });

    const isEmailSent = await this.emailService.sendVerificationCode(
      dto.email,
      code,
    );
    if (!isEmailSent) {
      throw new InternalServerErrorException(
        'Failed to send verification email. Please try again later.',
      );
    }

    return {
      message: 'Verification code sent to email',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.userDbService.findUserByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive) {
      throw new ForbiddenException(
        'User account is deactivated. Please contact support.',
      );
    }

    const verificationRecord =
      await this.userDbService.findValidVerificationCode(
        dto.email,
        VerificationType.RESET_PASSWORD,
      );
    if (!verificationRecord) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (verificationRecord.attempts >= 5) {
      throw new BadRequestException(
        'This verification code has been blocked due to too many failed attempts. Please request a new code.',
      );
    }

    const isMatch = await this.passwordService.comparePassword(
      dto.code,
      verificationRecord.code,
    );
    if (!isMatch) {
      const updated = await this.userDbService.incrementVerificationAttempts(
        verificationRecord.id,
      );
      const attemptsLeft = Math.max(0, 5 - updated.attempts);

      if (updated.attempts >= 5) {
        await this.userDbService.markVerificationCodeAsUsed(
          verificationRecord.id,
        );
        throw new BadRequestException(
          'Too many failed attempts. This verification code has been blocked. Please request a new code.',
        );
      }

      throw new BadRequestException(
        `Invalid verification code. You have ${attemptsLeft} attempt(s) remaining.`,
      );
    }

    const isSameAsOld = await this.passwordService.comparePassword(
      dto.newPassword,
      user.passwordHash,
    );
    if (isSameAsOld) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const newPasswordHash = await this.passwordService.hashPassword(
      dto.newPassword,
    );
    await this.userDbService.updatePassword(user.id, newPasswordHash);
    await this.userDbService.deleteVerificationCodesByEmail(
      dto.email,
      VerificationType.RESET_PASSWORD,
    );

    this.auditService
      .log({
        entityType: 'USER',
        entityId: user.id,
        action: 'RESET_PASSWORD',
        actorType: AuditActorType.USER,
        actorId: user.id,
        details: { email: user.email },
      })
      .catch((err) => {
        this.logger.error('Failed to log reset password audit event', err);
      });

    return {
      message: 'Password reset successfully',
    };
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const dbUser = await this.userDbService.findUserById(user.id);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    const isCurrentValid = await this.passwordService.comparePassword(
      dto.currentPassword,
      dbUser.passwordHash,
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isSameAsOld = await this.passwordService.comparePassword(
      dto.newPassword,
      dbUser.passwordHash,
    );
    if (isSameAsOld) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const newPasswordHash = await this.passwordService.hashPassword(
      dto.newPassword,
    );
    await this.userDbService.updatePassword(user.id, newPasswordHash);

    this.auditService
      .log({
        entityType: 'USER',
        entityId: user.id,
        action: 'CHANGE_PASSWORD',
        actorType: AuditActorType.USER,
        actorId: user.id,
        details: { email: user.email },
      })
      .catch((err) => {
        this.logger.error('Failed to log change password audit event', err);
      });

    return {
      message: 'Password changed successfully',
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.userDbService.findUserByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('User with this email does not exist');
    }

    if (!user.isActive) {
      throw new ForbiddenException(
        'User account is deactivated. Please contact support.',
      );
    }

    if (user.isEmailVerified) {
      return {
        message: 'Email is already verified. You can log in.',
      };
    }

    const verificationRecord =
      await this.userDbService.findValidVerificationCode(
        dto.email,
        VerificationType.EMAIL_VERIFICATION,
      );
    if (!verificationRecord) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (verificationRecord.attempts >= 5) {
      throw new BadRequestException(
        'This verification code has been blocked due to too many failed attempts. Please request a new code.',
      );
    }

    const isMatch = await this.passwordService.comparePassword(
      dto.code,
      verificationRecord.code,
    );
    if (!isMatch) {
      const updated = await this.userDbService.incrementVerificationAttempts(
        verificationRecord.id,
      );
      const attemptsLeft = Math.max(0, 5 - updated.attempts);

      if (updated.attempts >= 5) {
        await this.userDbService.markVerificationCodeAsUsed(
          verificationRecord.id,
        );
        throw new BadRequestException(
          'Too many failed attempts. This verification code has been blocked. Please request a new code.',
        );
      }

      throw new BadRequestException(
        `Invalid verification code. You have ${attemptsLeft} attempt(s) remaining.`,
      );
    }

    await this.userDbService.markEmailAsVerified(user.id);
    await this.userDbService.deleteVerificationCodesByEmail(
      dto.email,
      VerificationType.EMAIL_VERIFICATION,
    );

    this.auditService
      .log({
        entityType: 'USER',
        entityId: user.id,
        action: 'EMAIL_VERIFIED',
        actorType: AuditActorType.USER,
        actorId: user.id,
        details: { email: user.email },
      })
      .catch((err) => {
        this.logger.error('Failed to log email verification audit event', err);
      });

    return {
      message: 'Email verified successfully. You can now log in.',
    };
  }

  async resendVerificationCode(dto: ForgotPasswordDto) {
    const user = await this.userDbService.findUserByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('User with this email does not exist');
    }

    if (!user.isActive) {
      throw new ForbiddenException(
        'User account is deactivated. Please contact support.',
      );
    }

    if (user.isEmailVerified) {
      return {
        message: 'Email is already verified. You can log in.',
      };
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const hashedCode = await this.passwordService.hashPassword(code);

    await this.userDbService.deleteVerificationCodesByEmail(
      dto.email,
      VerificationType.EMAIL_VERIFICATION,
    );

    await this.userDbService.createVerificationCode({
      email: dto.email,
      code: hashedCode,
      expiresAt,
      userId: user.id,
      type: VerificationType.EMAIL_VERIFICATION,
    });

    const isEmailSent = await this.emailService.sendVerificationCode(
      dto.email,
      code,
      'Email Verification',
    );
    if (!isEmailSent) {
      throw new InternalServerErrorException(
        'Failed to send verification email. Please try again later.',
      );
    }

    return {
      message: 'Verification code resent to your email.',
    };
  }

  getMe(user: AuthUser): AuthUser {
    return user;
  }

  extractRefreshToken(req: Request, fallbackToken?: string): string | null {
    if (
      req.cookies &&
      typeof req.cookies.refreshToken === 'string' &&
      req.cookies.refreshToken.trim()
    ) {
      return req.cookies.refreshToken.trim();
    }

    if (req.headers.cookie) {
      const cookies = req.headers.cookie.split(';');
      for (const cookie of cookies) {
        const [name, ...rest] = cookie.trim().split('=');
        if (name === 'refreshToken') {
          const val = rest.join('=');
          if (val) return decodeURIComponent(val);
        }
      }
    }

    if (typeof fallbackToken === 'string' && fallbackToken.trim()) {
      return fallbackToken.trim();
    }

    return null;
  }

  async refreshTokens(req: Request, res: Response, fallbackToken?: string) {
    const refreshToken = this.extractRefreshToken(req, fallbackToken);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }

    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      this.clearRefreshTokenCookie(res);
      throw new UnauthorizedException(
        'Invalid or expired refresh token. Please login again.',
      );
    }

    if (!payload?.sub || payload.tokenType !== 'refresh') {
      this.clearRefreshTokenCookie(res);
      throw new UnauthorizedException(
        'Invalid or expired refresh token. Please login again.',
      );
    }

    const user = await this.userDbService.findUserById(payload.sub);
    if (!user) {
      this.clearRefreshTokenCookie(res);
      throw new UnauthorizedException(
        'Invalid or expired refresh token. Please login again.',
      );
    }

    if (!user.isActive) {
      this.clearRefreshTokenCookie(res);
      throw new ForbiddenException(
        'User account is deactivated. Please contact support.',
      );
    }

    // 1. Delete/clear the old cookie
    this.clearRefreshTokenCookie(res);

    // 2. Generate brand new accessToken (15m) and refreshToken (7d)
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      await this.generateTokens(user);

    // 3. Set the new refresh token cookie with new 7-day expiry
    this.setRefreshTokenCookie(res, newRefreshToken);

    // 4. Return new access token and safe user
    return {
      accessToken: newAccessToken,
      user: toSafeUser(user),
    };
  }

  async logout(res: Response) {
    this.clearRefreshTokenCookie(res);
    return {
      message: 'Logged out successfully',
    };
  }
}
