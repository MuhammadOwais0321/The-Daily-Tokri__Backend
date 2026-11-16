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
 * Controller for notifications inbox and real-time streaming.
 * Accessible by both registered CUSTOMERs and store ADMINs.
 *
 * Route order (Docs 04 §3): static routes ('unread-count', 'stream', 'read-all')
 * MUST be declared before dynamic parameter routes (':id/read') to prevent route shadowing.
 * Verified against docs: api-reference Part 1 & 2, 01 §22.3.
 */
@Throttle(RATE_LIMITS.USER)
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Returns unread notifications count for the authenticated user.
   * GET /notifications/unread-count
   */
  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: AuthUser): Promise<IUnreadCountResponse> {
    return this.notificationService.getUnreadCount(user.id);
  }

  /**
   * Real-time Server-Sent Events (SSE) stream.
   * Emits live notifications and a 30-second heartbeat.
   * GET /notifications/stream
   */
  @Sse('stream')
  getStream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.notificationService.getStream(user.id);
  }

  /**
   * Lists paginated notifications for the authenticated user.
   * Supports ?unreadOnly=true and standard pagination (?page=1&limit=10).
   * GET /notifications
   */
  @Get()
  getUserNotifications(
    @CurrentUser() user: AuthUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.getUserNotifications(user.id, query);
  }

  /**
   * Marks all unread notifications for the authenticated user as read.
   * PATCH /notifications/read-all
   */
  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: AuthUser): Promise<IMarkAllReadResponse> {
    return this.notificationService.markAllAsRead(user.id);
  }

  /**
   * Marks a specific notification as read.
   * Strictly enforces user ownership (404 on mismatch).
   * PATCH /notifications/:id/read
   */
  @Patch(':id/read')
  markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<INotificationResponse> {
    return this.notificationService.markAsRead(id, user.id);
  }
}
