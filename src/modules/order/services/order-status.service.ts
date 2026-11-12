import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryType, OrderStatus, Prisma } from '@prisma/client';
import { AuditActorType } from '../../../common/enums';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { AuthUser } from '../../auth/types';
import { UpdateOrderStatusDto } from '../dto';
import { toOrderResponse } from '../mappers';
import { OrderDbService } from '../order.db.service';
import { ADMIN_ALLOWED_TRANSITIONS, IOrderResponse } from '../types';

@Injectable()
export class OrderStatusService {
  private readonly logger = new Logger(OrderStatusService.name);

  constructor(
    private readonly orderDb: OrderDbService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Advances the order through fulfillment states (Admin only).
   * Verified against docs: 01 §19.
   *
   * Rules:
   * - Transition to CANCELLED must use the /cancel endpoint -> 400
   * - Transition must follow ADMIN_ALLOWED_TRANSITIONS map -> 400
   * - READY_FOR_PICKUP only allowed for PICKUP orders -> 400
   * - READY_FOR_DELIVERY only allowed for DELIVERY orders -> 400
   * - Optimistic concurrency guarded update WHERE id AND status = currentStatus -> 409
   * - Records appropriate timestamp (processedAt, readyAt, deliveredAt)
   * - Dispatches notification to customer on status change (fire-and-forget)
   */
  async updateStatus(
    orderId: string,
    admin: AuthUser,
    dto: UpdateOrderStatusDto,
  ): Promise<IOrderResponse> {
    if (dto.status === OrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Use the /cancel endpoint to cancel an order.',
      );
    }

    const order = await this.orderDb.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    const allowedNext = ADMIN_ALLOWED_TRANSITIONS[order.status] || [];
    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition from ${order.status} to ${dto.status}.`,
      );
    }

    if (
      dto.status === OrderStatus.READY_FOR_PICKUP &&
      order.deliveryType !== DeliveryType.PICKUP
    ) {
      throw new BadRequestException(
        'READY_FOR_PICKUP is only valid for PICKUP orders.',
      );
    }

    if (
      dto.status === OrderStatus.READY_FOR_DELIVERY &&
      order.deliveryType !== DeliveryType.DELIVERY
    ) {
      throw new BadRequestException(
        'READY_FOR_DELIVERY is only valid for DELIVERY orders.',
      );
    }

    const timestampData: Prisma.OrderUpdateInput = {};
    if (dto.status === OrderStatus.PROCESSING) {
      timestampData.processedAt = new Date();
    } else if (
      dto.status === OrderStatus.READY_FOR_PICKUP ||
      dto.status === OrderStatus.READY_FOR_DELIVERY
    ) {
      timestampData.readyAt = new Date();
    } else if (dto.status === OrderStatus.DELIVERED) {
      timestampData.deliveredAt = new Date();
    }

    const success = await this.orderDb.updateStatusGuarded(
      order.id,
      order.status,
      dto.status,
      timestampData,
    );

    if (!success) {
      throw new ConflictException(
        'Order status changed concurrently before update could complete. Please refresh and try again.',
      );
    }

    const updated = await this.orderDb.findById(order.id);

    this.logger.log(
      `Order ${order.orderNumber} status updated: ${order.status} -> ${dto.status} by admin ${admin.email}`,
    );

    // Audit log (fire-and-forget)
    this.auditService
      .log({
        entityType: 'ORDER',
        entityId: order.id,
        action: 'UPDATE_ORDER_STATUS',
        actorType: AuditActorType.ADMIN,
        actorId: admin.id,
        details: {
          orderNumber: order.orderNumber,
          previousStatus: order.status,
          newStatus: dto.status,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record status update audit log: ${(err as Error).message}`,
        );
      });

    // Notify customer about status transition (fire-and-forget, docs 01 §19)
    this.notificationService
      .dispatchUserNotification(order.userId, {
        title: 'Order Status Update',
        message: `Your order #${order.orderNumber} is now ${dto.status.replace(/_/g, ' ')}.`,
        referenceId: order.id,
        referenceEvent: `ORDER_STATUS_${dto.status}`,
      })
      .catch((err) => {
        this.logger.error(
          `Failed to dispatch customer status update notification: ${(err as Error).message}`,
        );
      });

    return toOrderResponse(updated!);
  }
}
