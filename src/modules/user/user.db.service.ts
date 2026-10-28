import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma, User, UserRole, VerificationType } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  phone?: string | null;
  role?: UserRole;
  isActive?: boolean;
  isEmailVerified?: boolean;
}

@Injectable()
export class UserDbService {
  private readonly logger = new Logger(UserDbService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async findUserByEmail(email: string): Promise<User | null> {
    return this.databaseService.user.findUnique({
      where: { email },
    });
  }

  async findUserByPhone(phone: string): Promise<User | null> {
    return this.databaseService.user.findUnique({
      where: { phone },
    });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.databaseService.user.findUnique({
      where: { id },
    });
  }

  async updateLastLogin(id: string): Promise<User> {
    return this.databaseService.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async updatePassword(id: string, passwordHash: string): Promise<User> {
    return this.databaseService.user.update({
      where: { id },
      data: { passwordHash },
    });
  }

  async createVerificationCode(data: {
    email: string;
    code: string;
    expiresAt: Date;
    userId?: string;
    type?: VerificationType;
  }) {
    return this.databaseService.verificationCode.create({
      data: {
        email: data.email,
        code: data.code,
        expiresAt: data.expiresAt,
        userId: data.userId ?? null,
        type: data.type ?? VerificationType.EMAIL_VERIFICATION,
      },
    });
  }

  async findValidVerificationCode(email: string, type: VerificationType) {
    return this.databaseService.verificationCode.findFirst({
      where: {
        email,
        type,
        isUsed: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async deleteVerificationCodesByEmail(email: string, type: VerificationType) {
    return this.databaseService.verificationCode.deleteMany({
      where: {
        email,
        type,
      },
    });
  }

  async markEmailAsVerified(userId: string): Promise<User> {
    return this.databaseService.user.update({
      where: { id: userId },
      data: { isEmailVerified: true },
    });
  }

  async incrementVerificationAttempts(id: string) {
    return this.databaseService.verificationCode.update({
      where: { id },
      data: {
        attempts: {
          increment: 1,
        },
      },
    });
  }

  async markVerificationCodeAsUsed(id: string) {
    return this.databaseService.verificationCode.update({
      where: { id },
      data: {
        isUsed: true,
      },
    });
  }

  async deleteExpiredOrUsedVerificationCodes() {
    return this.databaseService.verificationCode.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { isUsed: true }],
      },
    });
  }

  async createUser(data: CreateUserData): Promise<User> {
    try {
      return await this.databaseService.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash: data.passwordHash,
          phone: data.phone ?? null,
          role: data.role ?? UserRole.CUSTOMER,
          isActive: data.isActive ?? true,
          isEmailVerified: data.isEmailVerified ?? false,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This email or phone number is already associated with another account.',
        );
      }
      this.logger.error(
        `Failed to create user: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException('Failed to create user');
    }
  }
}
