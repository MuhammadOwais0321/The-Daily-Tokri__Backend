import { Injectable, Logger } from '@nestjs/common';
import { Notification, Prisma, UserPreference } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { NotificationQueryDto } from './dto';
import { IDispatchNotificationPayload } from './types';

@Injectable()
export class NotificationDbService {
  private readonly logger = new Logger(NotificationDbService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Upserts a notification on `(userId, referenceId, referenceEvent)` to prevent duplicates. */
  async upsertForUser(
    userId: string,
    data: IDispatchNotificationPayload,
  ): Promise<Notification> {
    if (data.referenceId && data.referenceEvent) {
      return this.db.notification.upsert({
        where: {
          userId_referenceId_referenceEvent: {
            userId,
            referenceId: data.referenceId,
            referenceEvent: data.referenceEvent,
          },
        },
        update: {
          title: data.title,
          message: data.message,
          isRead: false,
          readAt: null,
        },
        create: {
          userId,
          title: data.title,
          message: data.message,
          referenceId: data.referenceId,
          referenceEvent: data.referenceEvent,
        },
      });
    }

    return this.db.notification.create({
      data: {
        userId,
        title: data.title,
        message: data.message,
        referenceId: data.referenceId ?? null,
        referenceEvent: data.referenceEvent ?? null,
      },
    });
  }

  /** Retrieves paginated notifications scoped to the requesting user. */
  async findUserNotifications(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<{ data: Notification[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { isRead: false } : {}),
    };

    const [data, total] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.db.notification.count({ where }),
    ]);

    return { data, total };
  }

  async countUnread(userId: string): Promise<number> {
    return this.db.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  async findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<Notification | null> {
    return this.db.notification.findFirst({
      where: { id, userId },
    });
  }

  /** Marks a notification as read if owned by the user (idempotent). */
  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const existing = await this.findByIdAndUserId(id, userId);
    if (!existing) {
      return null;
    }

    if (existing.isRead) {
      return existing;
    }

    return this.db.notification.update({
      where: { id: existing.id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.db.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return result.count;
  }

  /** Deletes notifications older than the given cutoff date. */
  async deleteOlderThan(cutoffDate: Date): Promise<number> {
    const result = await this.db.notification.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }

  async getUserPreferences(userId: string): Promise<UserPreference | null> {
    return this.db.userPreference.findUnique({
      where: { userId },
    });
  }

  /** Fetches a user's delivery details (`email`, `name`, active status) alongside notification preferences. */
  async getUserNotificationTarget(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        deletedAt: true,
        preferences: true,
      },
    });
  }
}
