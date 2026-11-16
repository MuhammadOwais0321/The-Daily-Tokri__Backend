import { Notification } from '@prisma/client';
import { INotificationResponse } from '../types';

/** Maps a notification entity to `INotificationResponse`. */
export function toNotificationResponse(
  notification: Notification,
): INotificationResponse {
  return {
    id: notification.id,
    userId: notification.userId,
    title: notification.title,
    message: notification.message,
    referenceId: notification.referenceId,
    referenceEvent: notification.referenceEvent,
    isRead: notification.isRead,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
  };
}
