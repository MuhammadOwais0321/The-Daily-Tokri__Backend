import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ReviewStatus,
  User,
  UserPreference,
  UserRole,
  VerificationType,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { stripDeletedEmailPrefix } from '../auth/mappers/auth.mapper';
import { ListUsersQueryDto, UpdateUserPreferencesDto } from './dto';
import { CreateUserData } from './types';

export type { CreateUserData };

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

  /**
   * Checks in a single query whether another user already uses the given phone number.
   */
  async findPhoneConflict(
    phone: string,
    excludeUserId: string,
  ): Promise<Pick<User, 'id'> | null> {
    return this.databaseService.user.findFirst({
      where: {
        phone,
        id: { not: excludeUserId },
      },
      select: { id: true },
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
      this.handlePrismaError(
        error,
        'create user',
        'This email or phone number is already associated with another account.',
      );
    }
  }

  /**
   * Updates user's profile fields (name, phone) and maps phone unique conflicts to 409 (Docs 01 §6).
   */
  async updateProfile(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    try {
      return await this.databaseService.user.update({
        where: { id },
        data,
      });
    } catch (error: unknown) {
      this.handlePrismaError(
        error,
        'update user profile',
        'This mobile number is already associated with another account.',
      );
    }
  }

  /**
   * Updates customer active status (Docs 01 §5).
   */
  async updateStatus(id: string, isActive: boolean): Promise<User> {
    try {
      return await this.databaseService.user.update({
        where: { id },
        data: { isActive },
      });
    } catch (error: unknown) {
      this.handlePrismaError(error, 'update user status');
    }
  }

  /**
   * Paginated list of users for admin with search, role, isActive, and includeDeleted filters (Docs 01 §5).
   */
  async findManyUsers(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    // Default includeDeleted = false (Docs 01 §5)
    if (!query.includeDeleted) {
      where.deletedAt = null;
    }

    if (query.role) {
      where.role = query.role;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.databaseService.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.databaseService.user.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * GDPR-style self-deletion in a single atomic transaction (Docs 01 §6):
   * - Deletes addresses, cart (cascades cart_items), notifications, preferences, and verification codes
   * - Anonymizes email (`[DELETED] <id>:<email>`), clears phone, replaces passwordHash with random hash,
   *   sets isActive=false and deletedAt=now
   * - Preserves orders and reviews for accounting and product history
   */
  async anonymizeAndDeleteAccount(
    user: Pick<User, 'id' | 'email'>,
    randomPasswordHash: string,
  ): Promise<void> {
    const cleanEmail = stripDeletedEmailPrefix(user.email);
    const anonymizedEmail = `[DELETED] ${user.id}:${cleanEmail}`.slice(0, 255);

    try {
      await this.databaseService.$transaction(async (tx) => {
        await tx.address.deleteMany({ where: { userId: user.id } });
        await tx.cart.deleteMany({ where: { userId: user.id } });
        await tx.notification.deleteMany({ where: { userId: user.id } });
        await tx.userPreference.deleteMany({ where: { userId: user.id } });
        await tx.verificationCode.deleteMany({ where: { userId: user.id } });

        await tx.user.update({
          where: { id: user.id },
          data: {
            email: anonymizedEmail,
            phone: null,
            passwordHash: randomPasswordHash,
            isActive: false,
            deletedAt: new Date(),
          },
        });
      });
    } catch (error: unknown) {
      this.handlePrismaError(error, 'delete user account');
    }
  }

  /**
   * Computes user profile stats (totalOrders, totalSpent, avgRating across approved reviews) in parallel.
   * Verified against docs: 01 §22.7, api-reference.md.
   */
  async getUserStats(userId: string): Promise<{
    totalOrders: number;
    totalSpent: Prisma.Decimal;
    avgRating: number;
  }> {
    const [user, reviewAgg] = await Promise.all([
      this.databaseService.user.findUnique({
        where: { id: userId },
        select: {
          totalOrders: true,
          totalSpent: true,
        },
      }),
      this.databaseService.review.aggregate({
        where: {
          userId,
          status: ReviewStatus.APPROVED,
        },
        _avg: {
          rating: true,
        },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const avgRating = reviewAgg._avg.rating
      ? Number(reviewAgg._avg.rating.toFixed(2))
      : 0;

    return {
      totalOrders: user.totalOrders,
      totalSpent: user.totalSpent,
      avgRating,
    };
  }

  // --- User Notification Preferences (Docs 01 §22.4) ---

  async findOrCreateDefaultPreferences(
    userId: string,
  ): Promise<UserPreference> {
    return this.databaseService.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        pushNotification: true,
        emailNotification: true,
      },
      update: {},
    });
  }

  async upsertPreferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<UserPreference> {
    return this.databaseService.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        pushNotification: dto.pushNotification ?? true,
        emailNotification: dto.emailNotification ?? true,
      },
      update: {
        ...(dto.pushNotification !== undefined
          ? { pushNotification: dto.pushNotification }
          : {}),
        ...(dto.emailNotification !== undefined
          ? { emailNotification: dto.emailNotification }
          : {}),
      },
    });
  }

  private handlePrismaError(
    error: unknown,
    action: string,
    conflictMessage = 'Unique constraint violation.',
  ): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(conflictMessage);
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('User not found.');
      }
    }

    this.logger.error(
      `Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}
