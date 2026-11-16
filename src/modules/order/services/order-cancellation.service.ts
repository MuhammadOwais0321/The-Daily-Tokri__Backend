import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  BatchStatus,
  OrderStatus,
  PaymentStatus,
  TransactionType,
} from '@prisma/client';
import { OrderCancellationReason } from '../../../common/enums';
import { AuditService } from '../../audit/audit.service';
import { InventoryDbService } from '../../inventory/inventory.db.service';
import { NotificationService } from '../../notification/notification.service';
import { RefundService } from '../../payment/services/refund.service';
import { AuthUser } from '../../auth/types';
import { CancelOrderDto } from '../dto';
import { toOrderResponse } from '../mappers';
import { OrderDbService } from '../order.db.service';
import {
  ADMIN_CANCELLABLE_STATUSES,
  CUSTOMER_CANCELLABLE_STATUSES,
  IOrderResponse,
  OrderWithRelations,
} from '../types';

@Injectable()
export class OrderCancellationService {
  private readonly logger = new Logger(OrderCancellationService.name);

  constructor(
    private readonly orderDb: OrderDbService,
    private readonly inventoryDb: InventoryDbService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly refundService: RefundService,
  ) {}

  /** Cancels a customer's own order (permitted when `PENDING` or `CONFIRMED`). */
  async cancelCustomerOrder(
    orderId: string,
    user: AuthUser,
    dto: CancelOrderDto,
  ): Promise<IOrderResponse> {
    const order = await this.orderDb.findById(orderId, user.id);

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    if (order.status === OrderStatus.CANCELLED) {
      return toOrderResponse(order);
    }

    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Order cannot be cancelled once it is in ${order.status} status. Please contact support.`,
      );
    }

    if (dto.reason === OrderCancellationReason.OTHER && !dto.note?.trim()) {
      throw new BadRequestException(
        'Note is required when cancellation reason is OTHER.',
      );
    }

    const cancelled = await this._cancelOrderInTx(
      order,
      dto.reason,
      dto.note,
      user.id,
      AuditActorType.USER,
    );

    return toOrderResponse(cancelled);
  }

  /** Cancels an order at any pre-delivery stage on behalf of an admin. */
  async cancelAdminOrder(
    orderId: string,
    admin: AuthUser,
    dto: CancelOrderDto,
  ): Promise<IOrderResponse> {
    const order = await this.orderDb.findById(orderId);

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    if (order.status === OrderStatus.DELIVERED) {
      throw new BadRequestException('Cannot cancel a delivered order.');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Order is already cancelled.');
    }

    if (order.status === OrderStatus.REFUND_PENDING) {
      throw new BadRequestException('Order is already being refunded.');
    }

    if (!ADMIN_CANCELLABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Order cannot be cancelled from ${order.status} status.`,
      );
    }

    if (dto.reason === OrderCancellationReason.OTHER && !dto.note?.trim()) {
      throw new BadRequestException(
        'Note is required when cancellation reason is OTHER.',
      );
    }

    const cancelled = await this._cancelOrderInTx(
      order,
      dto.reason,
      dto.note,
      admin.id,
      AuditActorType.ADMIN,
    );

    return toOrderResponse(cancelled);
  }

  /** Auto-cancels an expired unpaid `PENDING` order and restores stock. */
  async cancelSystemTimeoutOrder(order: OrderWithRelations): Promise<void> {
    await this._cancelOrderInTx(
      order,
      OrderCancellationReason.PAYMENT_TIMEOUT,
      'Payment window expired (5 minutes). Order automatically cancelled by system.',
      'SYSTEM',
      AuditActorType.SYSTEM_TRIGGER,
    );
  }

  /**
   * Atomically transitions the order to `CANCELLED` (or `REFUND_PENDING` if paid),
   * restores non-expired batch/inventory stock, and triggers post-commit refund/notifications.
   */
  private async _cancelOrderInTx(
    order: OrderWithRelations,
    reason: string,
    note: string | undefined,
    actorId: string,
    actorType: AuditActorType,
  ): Promise<OrderWithRelations> {
    const isPaid = order.paymentStatus === PaymentStatus.PAID;
    const nextStatus = isPaid
      ? OrderStatus.REFUND_PENDING
      : OrderStatus.CANCELLED;

    const refreshedOrder = await this.orderDb.runInTransaction(async (tx) => {
      const updateResult = await tx.order.updateMany({
        where: {
          id: order.id,
          status: order.status,
        },
        data: {
          status: nextStatus,
          cancelledAt: new Date(),
          cancellationReason: reason,
          cancellationNote: note?.trim() || null,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          'Order status changed concurrently before cancellation could complete. Please refresh and try again.',
        );
      }

      if (isPaid) {
        await tx.user.update({
          where: { id: order.userId },
          data: {
            totalOrders: { decrement: 1 },
          },
        });
      }

      const orderItemIds = order.items.map((i) => i.id);
      const consumedTransactions = await tx.inventoryTransaction.findMany({
        where: {
          orderItemId: { in: orderItemIds },
          type: TransactionType.CONSUMED,
        },
        include: {
          inventory: {
            include: {
              product: {
                select: {
                  batchTracked: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const txn of consumedTransactions) {
        const isBatchTracked = txn.inventory.product.batchTracked;

        if (isBatchTracked) {
          let parsedAllocations: Array<{
            batchId: string;
            batchCode: string;
            quantity: number;
          }> = [];

          try {
            if (txn.note && txn.note.startsWith('{')) {
              const parsed = JSON.parse(txn.note) as {
                allocations?: Array<{
                  batchId: string;
                  batchCode: string;
                  quantity: number;
                }>;
              };
              parsedAllocations = parsed.allocations ?? [];
            }
          } catch {
            parsedAllocations = [];
          }

          // Restore stock only into non-expired batches
          let restoredBatchQuantity = 0;
          for (const alloc of parsedAllocations) {
            const batch = await tx.inventoryBatch.findUnique({
              where: { id: alloc.batchId },
            });

            if (batch) {
              const isExpired =
                batch.status === BatchStatus.EXPIRED ||
                new Date(batch.expiryDate) < today;

              if (!isExpired) {
                await tx.inventoryBatch.update({
                  where: { id: batch.id },
                  data: {
                    qtyOnHand: { increment: alloc.quantity },
                    status: BatchStatus.ACTIVE,
                  },
                });
                restoredBatchQuantity += alloc.quantity;
              } else {
                this.logger.warn(
                  `Skipping stock restore to expired batch "${batch.batchCode}" for order ${order.orderNumber}`,
                );
              }
            }
          }

          if (restoredBatchQuantity > 0) {
            await tx.inventory.update({
              where: { id: txn.inventoryId },
              data: { qtyOnHand: { increment: restoredBatchQuantity } },
            });
          }
        } else {
          await tx.inventory.update({
            where: { id: txn.inventoryId },
            data: { qtyOnHand: { increment: txn.quantity } },
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            inventoryId: txn.inventoryId,
            type: TransactionType.RELEASED,
            quantity: txn.quantity,
            orderItemId: txn.orderItemId,
            performedBy: actorId,
            note: `Restored from cancelled order ${order.orderNumber}`,
          },
        });

        await this.inventoryDb.refreshInventoryStatus(txn.inventoryId, tx);
      }

      const complete = await tx.order.findUnique({
        where: { id: order.id },
        include: this.orderDb.orderInclude,
      });

      return complete!;
    });

    this.logger.log(
      `Order ${refreshedOrder.orderNumber} (${refreshedOrder.id}) cancelled (${refreshedOrder.status}) by ${actorType} ${actorId}`,
    );

    // Trigger post-commit gateway refund for paid orders (RefundRetryCron retries if this fails)
    if (refreshedOrder.status === OrderStatus.REFUND_PENDING) {
      const paidPayment = refreshedOrder.payments.find(
        (p) => p.status === PaymentStatus.PAID,
      );

      if (paidPayment) {
        this.refundService
          .processRefund(
            refreshedOrder.id,
            refreshedOrder.orderNumber,
            refreshedOrder.userId,
            paidPayment.id,
            paidPayment.gatewayRef,
            paidPayment.amount,
            !!refreshedOrder.confirmedAt,
          )
          .catch((err) => {
            this.logger.error(
              `[OrderCancellation] Post-commit refund call failed for order ` +
                `${refreshedOrder.orderNumber} — cron will retry: ${(err as Error).message}`,
            );
          });
      } else {
        this.logger.warn(
          `[OrderCancellation] Order ${refreshedOrder.orderNumber} is REFUND_PENDING ` +
            `but no PAID payment found — cron will handle.`,
        );
      }
    }

    this.auditService
      .log({
        entityType: 'ORDER',
        entityId: refreshedOrder.id,
        action: 'CANCEL_ORDER',
        actorType,
        actorId,
        details: {
          orderNumber: refreshedOrder.orderNumber,
          previousStatus: order.status,
          newStatus: refreshedOrder.status,
          reason,
          note,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record cancel order audit log: ${(err as Error).message}`,
        );
      });

    this.notificationService
      .dispatchUserNotification(refreshedOrder.userId, {
        title: 'Order Cancelled',
        message: `Your order #${refreshedOrder.orderNumber} has been cancelled (${reason}).`,
        referenceId: refreshedOrder.id,
        referenceEvent: 'ORDER_CANCELLED',
      })
      .catch((err) => {
        this.logger.error(
          `Failed to dispatch cancellation notification to customer: ${(err as Error).message}`,
        );
      });

    if (actorType !== AuditActorType.ADMIN) {
      this.notificationService
        .dispatchAdminNotification({
          title: `Order Cancelled (${actorType})`,
          message: `Order #${refreshedOrder.orderNumber} was cancelled by ${actorType} (${reason}).`,
          referenceId: refreshedOrder.id,
          referenceEvent: `ORDER_CANCELLED_${actorType}`,
        })
        .catch((err) => {
          this.logger.error(
            `Failed to dispatch cancellation notification to admins: ${(err as Error).message}`,
          );
        });
    }

    return refreshedOrder;
  }
}
