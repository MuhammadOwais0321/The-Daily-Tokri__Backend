import {
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { StockStatus, UserRole } from '@prisma/client';
import { interval, merge, Observable, Subject } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { buildMeta, PaginationMeta } from '../../common/pagination';
import { DatabaseService } from '../../database/database.service';
import { NotificationQueryDto } from './dto';
import { toNotificationResponse } from './mappers';
import { NotificationDbService } from './notification.db.service';
import {
  IDispatchNotificationPayload,
  IMarkAllReadResponse,
  INotificationResponse,
  IUnreadCountResponse,
} from './types';

/**
 * Business logic for Notifications.
 *
 * Rules (Docs 01 §2.8, 01 §22.3):
 * - In-app notification DB upsert on @@unique([userId, referenceId, referenceEvent])
 * - Live Server-Sent Events (SSE) via /notifications/stream with 30s heartbeat
 * - User preferences: pushNotification false suppresses real-time SSE push
 * - All dispatch operations are fire-and-forget (failures logged, never break main flow)
 * - Ownership is enforced: users can only view and update their own notifications
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  // In-memory active SSE streams per user (Docs 01 §2.8)
  private readonly userStreams = new Map<string, Set<Subject<MessageEvent>>>();

  constructor(
    private readonly db: DatabaseService,
    private readonly notificationDb: NotificationDbService,
  ) {}

  /**
   * Retrieves paginated notifications for the logged-in user.
   * Returns standard { data, meta } shape.
   * Verified against docs: 05 §4.
   */
  async getUserNotifications(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<{ data: INotificationResponse[]; meta: PaginationMeta }> {
    const page = query.page || 1;
    const limit = query.limit || 10;

    const { data, total } = await this.notificationDb.findUserNotifications(
      userId,
      query,
    );

    return {
      data: data.map(toNotificationResponse),
      meta: buildMeta(total, page, limit),
    };
  }

  /**
   * Returns count of unread notifications for the user.
   */
  async getUnreadCount(userId: string): Promise<IUnreadCountResponse> {
    const count = await this.notificationDb.countUnread(userId);
    return { count };
  }

  /**
   * Marks a single notification as read.
   * Validates ownership: if the notification does not exist or belongs to another user,
   * throws NotFoundException (404) to prevent resource existence leakage.
   * Verified against docs: 06 §7.
   */
  async markAsRead(
    id: string,
    userId: string,
  ): Promise<INotificationResponse> {
    const updated = await this.notificationDb.markAsRead(id, userId);

    if (!updated) {
      throw new NotFoundException('Notification not found.');
    }

    return toNotificationResponse(updated);
  }

  /**
   * Marks all unread notifications for the user as read.
   */
  async markAllAsRead(userId: string): Promise<IMarkAllReadResponse> {
    const count = await this.notificationDb.markAllAsRead(userId);
    return {
      count,
      message: 'All notifications marked as read.',
    };
  }

  /**
   * Real-time Server-Sent Events stream for connected clients.
   * Provides 30-second heartbeat to keep connection alive.
   * Cleans up listeners automatically upon client disconnect.
   * Verified against docs: 01 §2.8.
   */
  getStream(userId: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    let userSockets = this.userStreams.get(userId);
    if (!userSockets) {
      userSockets = new Set();
      this.userStreams.set(userId, userSockets);
    }
    userSockets.add(subject);

    // 30-second heartbeat ping
    const heartbeat$ = interval(30000).pipe(
      map(
        () =>
          ({
            data: {
              type: 'heartbeat',
              timestamp: new Date().toISOString(),
            },
          }) as MessageEvent,
      ),
    );

    return merge(subject.asObservable(), heartbeat$).pipe(
      finalize(() => {
        const sockets = this.userStreams.get(userId);
        if (sockets) {
          sockets.delete(subject);
          if (sockets.size === 0) {
            this.userStreams.delete(userId);
          }
        }
      }),
    );
  }

  /**
   * Dispatches an in-app notification to a specific user.
   * Fire-and-forget; handles DB upsert and SSE push according to user preference.
   * Verified against docs: 01 §2.8.
   */
  async dispatchUserNotification(
    userId: string,
    data: IDispatchNotificationPayload,
  ): Promise<void> {
    try {
      const record = await this.notificationDb.upsertForUser(userId, data);
      const mapped = toNotificationResponse(record);

      // Check user preferences for real-time push (Docs 01 §2.8)
      const prefs = await this.notificationDb.getUserPreferences(userId);
      const pushAllowed = prefs ? prefs.pushNotification : true;

      if (pushAllowed) {
        this.emitToUser(userId, mapped);
      }

      this.logger.log(
        `User notification "${data.title}" dispatched to user ${userId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch user notification to user "${userId}": ${(err as Error).message}`,
      );
    }
  }

  /**
   * Dispatches an in-app notification to all active store administrators.
   * Fire-and-forget; uses unique (userId, referenceId, referenceEvent) to prevent duplicate notifications.
   * Verified against docs: 01 §2.8, 01 §14.
   */
  async dispatchAdminNotification(
    data: IDispatchNotificationPayload,
  ): Promise<void> {
    try {
      const admins = await this.db.user.findMany({
        where: { role: UserRole.ADMIN, isActive: true },
        select: { id: true },
      });

      if (admins.length === 0) return;

      await Promise.allSettled(
        admins.map((admin) => this.dispatchUserNotification(admin.id, data)),
      );

      this.logger.log(
        `Admin notification "${data.title}" dispatched to ${admins.length} admin(s)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch admin notification: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Dispatches stock status alert (LOW_STOCK or OUT_OF_STOCK) to administrators.
   * Fire-and-forget.
   * Verified against docs: 01 §11.
   */
  async dispatchStockNotification(
    inventoryId: string,
    productName: string,
    newStatus: StockStatus,
  ): Promise<void> {
    try {
      const isLow = newStatus === StockStatus.LOW_STOCK;
      const title = isLow ? 'Low Stock Alert' : 'Out of Stock Alert';
      const message = isLow
        ? `"${productName}" is running low on stock. Please restock soon.`
        : `"${productName}" is out of stock. Immediate restocking required.`;
      const referenceEvent = isLow ? 'STOCK_LOW' : 'STOCK_OUT';

      await this.dispatchAdminNotification({
        title,
        message,
        referenceId: inventoryId,
        referenceEvent,
      });

      this.logger.log(
        `Stock notification (${newStatus}) dispatched for "${productName}"`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch stock notification for inventory "${inventoryId}": ${(err as Error).message}`,
      );
    }
  }

  /**
   * Emits a real-time notification payload to active SSE connections for a user.
   */
  private emitToUser(userId: string, notification: INotificationResponse): void {
    const sockets = this.userStreams.get(userId);
    if (sockets && sockets.size > 0) {
      const event: MessageEvent = {
        data: {
          type: 'notification',
          payload: notification,
        },
      };

      for (const subject of sockets) {
        try {
          subject.next(event);
        } catch (err) {
          this.logger.warn(
            `Failed to emit SSE event to user ${userId}: ${(err as Error).message}`,
          );
        }
      }
    }
  }
}
