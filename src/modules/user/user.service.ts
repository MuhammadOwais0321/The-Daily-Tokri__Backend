import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditActorType, Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { buildMeta } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import {
  ListUsersQueryDto,
  UpdateUserPreferencesDto,
  UpdateUserProfileDto,
  UpdateUserStatusDto,
} from './dto';
import {
  toUserPreferenceResponse,
  toUserProfileResponse,
  toUserStatsResponse,
} from './mappers';
import {
  IUserListResponse,
  IUserPreferenceResponse,
  IUserProfileResponse,
  IUserStatsResponse,
} from './types';
import { UserDbService } from './user.db.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userDb: UserDbService,
    private readonly auditService: AuditService,
  ) {}

  private async getUserOrThrow(id: string): Promise<User> {
    const user = await this.userDb.findUserById(id);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  private logAudit(
    action: string,
    entityId: string,
    actorType: AuditActorType,
    actorId: string,
    details: Record<string, unknown>,
  ): void {
    this.auditService
      .log({
        entityType: 'USER',
        entityId,
        action,
        actorType,
        actorId,
        details,
      })
      .catch((err) => {
        this.logger.error(
          `Failed to log ${action} audit event: ${(err as Error).message}`,
        );
      });
  }

  /** Returns the current authenticated user's profile. */
  async getProfile(userId: string): Promise<IUserProfileResponse> {
    const user = await this.getUserOrThrow(userId);
    return toUserProfileResponse(user);
  }

  /** Returns the current authenticated user's order and rating statistics. */
  async getStats(userId: string): Promise<IUserStatsResponse> {
    const stats = await this.userDb.getUserStats(userId);
    return toUserStatsResponse(stats);
  }

  /** Updates the authenticated user's profile (`name`, `phone`) and enforces phone uniqueness. */
  async updateProfile(
    userId: string,
    dto: UpdateUserProfileDto,
  ): Promise<IUserProfileResponse> {
    if (dto.name === undefined && dto.phone === undefined) {
      throw new BadRequestException(
        'At least one field (name or phone) must be provided to update the profile.',
      );
    }

    const user = await this.getUserOrThrow(userId);

    const updateData: Prisma.UserUpdateInput = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name;
    }

    if (dto.phone !== undefined) {
      const normalizedPhone = dto.phone || null;
      if (normalizedPhone && normalizedPhone !== user.phone) {
        const conflict = await this.userDb.findPhoneConflict(
          normalizedPhone,
          userId,
        );
        if (conflict) {
          throw new ConflictException(
            'This mobile number is already associated with another account.',
          );
        }
      }
      updateData.phone = normalizedPhone;
    }

    const updated = await this.userDb.updateProfile(userId, updateData);

    this.logger.log(`User profile updated: ${updated.id}`);

    this.logAudit(
      'UPDATE_USER_PROFILE',
      updated.id,
      user.role === UserRole.ADMIN ? AuditActorType.ADMIN : AuditActorType.USER,
      updated.id,
      {
        name: updated.name,
        phone: updated.phone,
      },
    );

    return toUserProfileResponse(updated);
  }

  /** Anonymizes and deactivates a customer account in an atomic transaction. */
  async deleteAccount(userId: string): Promise<void> {
    const user = await this.getUserOrThrow(userId);

    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException(
        'Only customer accounts can be self-deleted.',
      );
    }

    const randomPasswordHash = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      12,
    );

    await this.userDb.anonymizeAndDeleteAccount(user, randomPasswordHash);

    this.logger.log(`Customer account anonymized and deactivated: ${userId}`);

    this.logAudit('DELETE_USER_ACCOUNT', userId, AuditActorType.USER, userId, {
      anonymizedAt: new Date().toISOString(),
    });
  }

  /** Returns a paginated user list for admin view with search and role/status filters. */
  async findAll(query: ListUsersQueryDto): Promise<IUserListResponse> {
    const { data, total, page, limit } = await this.userDb.findManyUsers(query);

    return {
      data: data.map(toUserProfileResponse),
      meta: buildMeta(total, page, limit),
    };
  }

  /** Activates or deactivates a customer account (blocks self-modification with 400 and admin targets with 403). */
  async updateStatus(
    targetUserId: string,
    adminId: string,
    dto: UpdateUserStatusDto,
  ): Promise<IUserProfileResponse> {
    if (targetUserId === adminId) {
      throw new BadRequestException(
        'You cannot change your own account status.',
      );
    }

    const targetUser = await this.getUserOrThrow(targetUserId);

    if (targetUser.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException(
        'Cannot modify status of an administrator account.',
      );
    }

    const updated =
      targetUser.isActive === dto.isActive
        ? targetUser
        : await this.userDb.updateStatus(targetUserId, dto.isActive);

    this.logger.log(
      `Customer ${targetUserId} status updated to isActive=${dto.isActive} by admin ${adminId}`,
    );

    this.logAudit(
      'UPDATE_USER_STATUS',
      targetUserId,
      AuditActorType.ADMIN,
      adminId,
      {
        previousIsActive: targetUser.isActive,
        newIsActive: dto.isActive,
      },
    );

    return toUserProfileResponse(updated);
  }

  async getPreferences(userId: string): Promise<IUserPreferenceResponse> {
    await this.getUserOrThrow(userId);
    const pref = await this.userDb.findOrCreateDefaultPreferences(userId);
    return toUserPreferenceResponse(pref);
  }

  async upsertPreferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<IUserPreferenceResponse> {
    await this.getUserOrThrow(userId);
    const pref = await this.userDb.upsertPreferences(userId, dto);
    return toUserPreferenceResponse(pref);
  }
}
