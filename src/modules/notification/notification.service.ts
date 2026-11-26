import {
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { StockStatus, UserRole } from '@prisma/client';
import { interval, merge, Observable, Subject } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { buildMeta, PaginationMeta } from '../../common/pagination';
import { EmailService } from '../../common/services/email.service';
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

/** Important transactional and store-alert events eligible for email delivery when `emailNotification` is enabled. */
const EMAIL_ELIGIBLE_EVENTS = new Set<string>([
  // Customer events
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILED',
  'PAYMENT_REFUNDED',
  'ORDER_STATUS_READY_FOR_PICKUP',
  'ORDER_STATUS_READY_FOR_DELIVERY',
  'ORDER_STATUS_DELIVERED',
  'ORDER_CANCELLED',
  // Admin events
  'PAYMENT_RECEIVED',
  'STOCK_OUT',
  'ORDER_CANCELLED_USER',
]);

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  // Active SSE streams per user
  private readonly userStreams = new Map<string, Set<Subject<MessageEvent>>>();

  constructor(
    private readonly db: DatabaseService,
    private readonly notificationDb: NotificationDbService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  /** Retrieves paginated notifications for the authenticated user. */
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

  /** Returns the unread notification count for the user. */
  async getUnreadCount(userId: string): Promise<IUnreadCountResponse> {
    const count = await this.notificationDb.countUnread(userId);
    return { count };
  }

  /** Marks a notification as read (throws 404 if not found or not owned). */
  async markAsRead(id: string, userId: string): Promise<INotificationResponse> {
    const updated = await this.notificationDb.markAsRead(id, userId);

    if (!updated) {
      throw new NotFoundException('Notification not found.');
    }

    return toNotificationResponse(updated);
  }

  /** Marks all unread notifications for the user as read. */
  async markAllAsRead(userId: string): Promise<IMarkAllReadResponse> {
    const count = await this.notificationDb.markAllAsRead(userId);
    return {
      count,
      message: 'All notifications marked as read.',
    };
  }

  /** Creates a real-time SSE stream for the user with a 30-second heartbeat and auto-cleanup on disconnect. */
  getStream(userId: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    let userSockets = this.userStreams.get(userId);
    if (!userSockets) {
      userSockets = new Set();
      this.userStreams.set(userId, userSockets);
    }
    userSockets.add(subject);

    const heartbeat$ = interval(30000).pipe(
      map(() => ({
        data: {
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        },
      })),
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
   * Upserts an in-app notification for a user, pushes it over SSE if `pushNotification` is enabled,
   * and emails eligible important events when `emailNotification` is enabled.
   */
  async dispatchUserNotification(
    userId: string,
    data: IDispatchNotificationPayload,
  ): Promise<void> {
    try {
      const record = await this.notificationDb.upsertForUser(userId, data);
      const mapped = toNotificationResponse(record);

      const target =
        await this.notificationDb.getUserNotificationTarget(userId);
      const pushAllowed = target?.preferences
        ? target.preferences.pushNotification
        : true;
      const emailAllowed = target?.preferences
        ? target.preferences.emailNotification
        : true;

      if (pushAllowed) {
        this.emitToUser(userId, mapped);
      }

      const isEmailEligible =
        data.sendEmail ??
        (Boolean(data.referenceEvent) &&
          EMAIL_ELIGIBLE_EVENTS.has(data.referenceEvent!));

      if (
        this.emailService &&
        isEmailEligible &&
        emailAllowed &&
        target &&
        target.isActive &&
        !target.deletedAt &&
        !target.email.startsWith('[DELETED]')
      ) {
        await this.emailService
          .sendNotificationEmail({
            to: target.email,
            recipientName: target.name,
            title: data.title,
            message: data.message,
          })
          .catch((emailErr) => {
            this.logger.error(
              `Failed to send notification email to user "${userId}": ${(emailErr as Error).message}`,
            );
          });
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

  /** Dispatches an in-app notification to all active store administrators. */
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

  /** Dispatches a `LOW_STOCK` or `OUT_OF_STOCK` alert to all active administrators. */
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
  private emitToUser(
    userId: string,
    notification: INotificationResponse,
  ): void {
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
