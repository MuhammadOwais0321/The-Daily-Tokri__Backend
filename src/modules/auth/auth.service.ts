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
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordService } from './password.service';
import { UserDbService } from '../user/user.db.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../../common/services/email.service';
import { AuditActorType } from '../../common/enums';
import { toSafeUser } from './mappers/auth.mapper';
import { AuthUser, JwtPayload } from './types';

export type { AuthUser };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userDbService: UserDbService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
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

    // 5. Create user with role CUSTOMER and isActive true
    const user = await this.userDbService.createUser({
      name: registerDto.name,
      email: registerDto.email,
      passwordHash,
      phone: cleanedPhone,
      role: UserRole.CUSTOMER,
      isActive: true,
    });

    // 6. Fire-and-forget audit log
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

    // 7. Return response without passwordHash
    return {
      message: 'Registration successful',
      user: toSafeUser(user),
    };
  }

  async login(loginDto: LoginDto) {
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

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
    };
    const accessToken = await this.jwtService.signAsync(payload);

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
      'RESET_PASSWORD',
    );

    await this.userDbService.createVerificationCode({
      email: dto.email,
      code: hashedCode,
      expiresAt,
      userId: user.id,
      type: 'RESET_PASSWORD',
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
        'RESET_PASSWORD',
      );
    if (!verificationRecord) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    const isMatch = await this.passwordService.comparePassword(
      dto.code,
      verificationRecord.code,
    );
    if (!isMatch) {
      throw new BadRequestException('Invalid or expired verification code');
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
      'RESET_PASSWORD',
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

  getMe(user: AuthUser): AuthUser {
    return user;
  }
}
