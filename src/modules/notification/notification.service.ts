import { Injectable, Logger } from '@nestjs/common';
import { StockStatus, UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationDbService } from './notification.db.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notificationDb: NotificationDbService,
  ) {}

  create(createNotificationDto: CreateNotificationDto) {
    return 'This action adds a new notification';
  }

  findAll() {
    return `This action returns all notification`;
  }

  findOne(id: number) {
    return `This action returns a #${id} notification`;
  }

  remove(id: number) {
    return `This action removes a #${id} notification`;
  }

  async dispatchStockNotification(
    inventoryId: string,
    productName: string,
    newStatus: StockStatus,
  ): Promise<void> {
    try {
      const admins = await this.db.user.findMany({
        where: { role: UserRole.ADMIN, isActive: true },
        select: { id: true },
      });

      if (admins.length === 0) return;

      const isLow = newStatus === StockStatus.LOW_STOCK;
      const title = isLow ? 'Low Stock Alert' : 'Out of Stock Alert';
      const message = isLow
        ? `"${productName}" is running low on stock. Please restock soon.`
        : `"${productName}" is out of stock. Immediate restocking required.`;
      const referenceEvent = isLow ? 'STOCK_LOW' : 'STOCK_OUT';

      await Promise.allSettled(
        admins.map((admin) =>
          this.notificationDb.upsertForUser(admin.id, {
            title,
            message,
            referenceId: inventoryId,
            referenceEvent,
          }),
        ),
      );

      this.logger.log(
        `Stock notification (${newStatus}) dispatched for "${productName}" to ${admins.length} admin(s)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch stock notification for inventory "${inventoryId}": ${(err as Error).message}`,
      );
    }
  }
}
