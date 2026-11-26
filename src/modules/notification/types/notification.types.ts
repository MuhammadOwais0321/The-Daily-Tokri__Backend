import { Notification } from '@prisma/client';

export type NotificationRecord = Notification;

export interface INotificationResponse {
  id: string;
  userId: string;
  title: string;
  message: string;
  referenceId: string | null;
  referenceEvent: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface IUnreadCountResponse {
  count: number;
}

export interface IMarkAllReadResponse {
  count: number;
  message: string;
}

export interface IDispatchNotificationPayload {
  title: string;
  message: string;
  referenceId?: string;
  referenceEvent?: string;
  /** Optional explicit override; otherwise determined from `EMAIL_ELIGIBLE_EVENTS`. */
  sendEmail?: boolean;
}

export interface INotificationStreamEvent {
  type: 'notification' | 'heartbeat';
  payload?: INotificationResponse;
  timestamp?: string;
}
