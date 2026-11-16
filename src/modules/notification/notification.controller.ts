import {
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Sse,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import type { AuthUser } from '../auth/types';
import { NotificationQueryDto } from './dto';
import { NotificationService } from './notification.service';
import {
  IMarkAllReadResponse,
  INotificationResponse,
  IUnreadCountResponse,
} from './types';

/**
 * Notification inbox and real-time SSE streaming endpoints.
 * Static routes (`unread-count`, `stream`, `read-all`) are declared before `:id/read` to avoid route shadowing.
 */
@Throttle(RATE_LIMITS.USER)
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /** Returns the unread notification count for the authenticated user. */
  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: AuthUser): Promise<IUnreadCountResponse> {
    return this.notificationService.getUnreadCount(user.id);
  }

  /** Real-time Server-Sent Events (SSE) stream with a 30-second heartbeat. */
  @Sse('stream')
  getStream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.notificationService.getStream(user.id);
  }

  /** Lists paginated notifications for the authenticated user. */
  @Get()
  getUserNotifications(
    @CurrentUser() user: AuthUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.getUserNotifications(user.id, query);
  }

  /** Marks all unread notifications for the authenticated user as read. */
  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: AuthUser): Promise<IMarkAllReadResponse> {
    return this.notificationService.markAllAsRead(user.id);
  }

  /** Marks a specific notification as read (returns 404 if not owned). */
  @Patch(':id/read')
  markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<INotificationResponse> {
    return this.notificationService.markAsRead(id, user.id);
  }
}
