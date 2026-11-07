import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class NotificationDbService {
  constructor(private readonly db: DatabaseService) {}

  async upsertForUser(
    userId: string,
    data: {
      title: string;
      message: string;
      referenceId?: string;
      referenceEvent?: string;
    },
  ) {
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
}
