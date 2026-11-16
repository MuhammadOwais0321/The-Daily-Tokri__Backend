import { Injectable, Logger } from '@nestjs/common';
import { Notification, Prisma, UserPreference } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { NotificationQueryDto } from './dto';
import { IDispatchNotificationPayload } from './types';

/**
 * Handles all database interactions for the Notification module.
 * Prisma queries stay here to keep service focused on business rules.
 * Verified against docs: 01 §2.8, 01 §22.3, 04 §5.
 */
@Injectable()
export class NotificationDbService {
  private readonly logger = new Logger(NotificationDbService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Upserts or creates an in-app notification for a given user.
   * If both referenceId and referenceEvent are provided, uses composite unique key
   * @@unique([userId, referenceId, referenceEvent]) to prevent duplicate notifications.
   * Verified against docs: 01 §2.8, 03 §3.
   */
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

  /**
   * Retrieves paginated notifications strictly scoped to the requesting user.
   * Verified against docs: 01 §22.3, 06 §7 (IDOR protection).
   */
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

  /**
   * Counts unread notifications for a user.
   */
  async countUnread(userId: string): Promise<number> {
    return this.db.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Finds a notification by ID and verifies it belongs to the user.
   */
  async findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<Notification | null> {
    return this.db.notification.findFirst({
      where: { id, userId },
    });
  }

  /**
   * Marks a single notification as read if it belongs to the user.
   * Idempotent: if already read, returns existing record without redundant write.
   */
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

  /**
   * Marks all unread notifications for a user as read.
   */
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

  /**
   * Deletes notifications older than the given cutoff date.
   * Used by retention cleanup cron.
   * Verified against docs: 01 §22.3, 02 §2.4.
   */
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

  /**
   * Fetches user notification preferences (e.g. pushNotification, emailNotification).
   * Verified against docs: 01 §2.8.
   */
  async getUserPreferences(userId: string): Promise<UserPreference | null> {
    return this.db.userPreference.findUnique({
      where: { userId },
    });
  }
}
