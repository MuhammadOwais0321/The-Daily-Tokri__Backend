import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BatchStatus,
  DeliveryType,
  OrderStatus,
  PaymentStatus,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { AuditActorType } from '../../../common/enums';
import { AddressDbService } from '../../addresses/address.db.service';
import { AuditService } from '../../audit/audit.service';
import { CartService } from '../../cart/cart.service';
import { NotificationService } from '../../notification/notification.service';
import { InventoryDbService } from '../../inventory/inventory.db.service';
import { AuthUser } from '../../auth/types';
import { CreateOrderDto } from '../dto';
import { toOrderResponse } from '../mappers';
import { OrderDbService } from '../order.db.service';
import { IOrderResponse } from '../types';

@Injectable()
export class OrderCreationService {
  private readonly logger = new Logger(OrderCreationService.name);

  constructor(
    private readonly orderDb: OrderDbService,
    private readonly addressDb: AddressDbService,
    private readonly inventoryDb: InventoryDbService,
    private readonly cartService: CartService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Places an order for the authenticated customer.
   * Runs as a single atomic transaction:
   * 1. Validates delivery options and resolves address
   * 2. Reads cart and verifies product availability
   * 3. Sorts items by productId ASC (deadlock prevention)
   * 4. Locks inventory/batch rows with SELECT ... FOR UPDATE
   * 5. Deducts stock (FEFO for batch-tracked items)
   * 6. Locks prices from server records (ignores client values)
   * 7. Generates order number from PostgreSQL sequence 'order_number_seq'
   * 8. Inserts Order, OrderItems, OrderAddress, and CONSUMED ledger entries
   * 9. Refreshes inventory status and clears cart
   *
   * Verified against docs: 01 §14, 03 §3, 04 §4.
   */
  async createOrder(
    user: AuthUser,
    dto: CreateOrderDto,
  ): Promise<IOrderResponse> {
    const userId = user.id;

    // 1. Validate delivery type and resolve address
    let resolvedAddress: {
      addressLine: string;
      city: string;
      county: string;
      postcode: string;
    } | null = null;

    if (dto.deliveryType === DeliveryType.DELIVERY) {
      if (dto.addressId && dto.shippingAddress) {
        throw new BadRequestException(
          'Provide either a saved address (addressId) or an inline shippingAddress, not both.',
        );
      }

      if (!dto.addressId && !dto.shippingAddress) {
        throw new BadRequestException(
          'Delivery orders require either a saved address (addressId) or an inline shippingAddress.',
        );
      }

      if (dto.pickupScheduledAt) {
        throw new BadRequestException(
          'pickupScheduledAt is not allowed for DELIVERY orders.',
        );
      }

      if (dto.addressId) {
        const saved = await this.addressDb.findByIdAndUserId(
          dto.addressId,
          userId,
        );
        if (!saved) {
          throw new NotFoundException('Delivery address not found.');
        }
        resolvedAddress = {
          addressLine: saved.addressLine,
          city: saved.city,
          county: saved.county,
          postcode: saved.postcode,
        };
      } else if (dto.shippingAddress) {
        resolvedAddress = {
          addressLine: dto.shippingAddress.addressLine.trim(),
          city: dto.shippingAddress.city.trim(),
          county: dto.shippingAddress.county.trim(),
          postcode: dto.shippingAddress.postcode.trim(),
        };
      }
    } else if (dto.deliveryType === DeliveryType.PICKUP) {
      if (dto.addressId || dto.shippingAddress) {
        throw new BadRequestException(
          'Delivery address is not allowed for PICKUP orders.',
        );
      }

      if (!dto.pickupScheduledAt) {
        throw new BadRequestException(
          'pickupScheduledAt is required for PICKUP orders.',
        );
      }
    }

    // 2. Execute entire order creation within an interactive transaction
    const createdOrder = await this.orderDb.runInTransaction(async (tx) => {
      // a. Read cart via CartService helper
      const cart = await this.cartService.getCartForOrder(userId, tx);

      if (!cart || !cart.items || cart.items.length === 0) {
        throw new BadRequestException('Cart is empty. Cannot create order.');
      }

      // b. Check product visibility and order quantity bounds
      for (const item of cart.items) {
        const product = item.product;
        if (!product.isActive || !product.isVisible) {
          throw new BadRequestException(
            `Product "${product.name}" is no longer available.`,
          );
        }

        if (
          item.quantity < product.minimumOrderQuantity ||
          item.quantity > product.maximumOrderQuantity
        ) {
          throw new BadRequestException(
            `Quantity for "${product.name}" must be between ${product.minimumOrderQuantity} and ${product.maximumOrderQuantity}.`,
          );
        }
      }

      // c. Deadlock prevention: sort items deterministically by productId ASC
      const sortedItems = [...cart.items].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      );

      // d. Lock and verify stock for each item
      const itemAllocationsMap = new Map<
        string,
        Array<{ batchId: string; batchCode: string; quantity: number }> | null
      >();
      const itemInventoryMap = new Map<string, { id: string }>();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const item of sortedItems) {
        const product = item.product;

        // Lock inventory row
        await this.orderDb.lockInventoryByProductId(item.productId, tx);

        const inventory = await tx.inventory.findUnique({
          where: { productId: item.productId },
        });

        if (!inventory) {
          throw new BadRequestException(
            `Inventory record not found for product "${product.name}".`,
          );
        }

        itemInventoryMap.set(item.productId, { id: inventory.id });

        if (product.batchTracked) {
          // Fetch ACTIVE, non-expired batches sorted by expiryDate ASC (FEFO)
          const batches = await tx.inventoryBatch.findMany({
            where: {
              inventoryId: inventory.id,
              status: BatchStatus.ACTIVE,
              expiryDate: { gte: today },
              qtyOnHand: { gt: 0 },
            },
            orderBy: { expiryDate: 'asc' },
          });

          const totalBatchStock = batches.reduce(
            (sum, b) => sum + b.qtyOnHand,
            0,
          );

          if (totalBatchStock < item.quantity) {
            throw new BadRequestException(
              `Not enough stock for "${product.name}". Requested: ${item.quantity}, Available: ${totalBatchStock}.`,
            );
          }

          // Lock batch rows
          for (const batch of batches) {
            await this.orderDb.lockBatchById(batch.id, tx);
          }

          // Deduct from batches using FEFO
          let remainingToDeduct = item.quantity;
          const allocations: Array<{
            batchId: string;
            batchCode: string;
            quantity: number;
          }> = [];

          for (const batch of batches) {
            if (remainingToDeduct <= 0) break;
            const deduct = Math.min(batch.qtyOnHand, remainingToDeduct);
            const newBatchQty = batch.qtyOnHand - deduct;
            const nextStatus =
              newBatchQty === 0 ? BatchStatus.DEPLETED : BatchStatus.ACTIVE;

            await tx.inventoryBatch.update({
              where: { id: batch.id },
              data: {
                qtyOnHand: newBatchQty,
                status: nextStatus,
              },
            });

            allocations.push({
              batchId: batch.id,
              batchCode: batch.batchCode,
              quantity: deduct,
            });

            remainingToDeduct -= deduct;
          }

          // Deduct from aggregate inventory
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { qtyOnHand: { decrement: item.quantity } },
          });

          itemAllocationsMap.set(item.productId, allocations);
        } else {
          // Non-batch product
          if (inventory.qtyOnHand < item.quantity) {
            throw new BadRequestException(
              `Not enough stock for "${product.name}". Requested: ${item.quantity}, Available: ${inventory.qtyOnHand}.`,
            );
          }

          await tx.inventory.update({
            where: { id: inventory.id },
            data: { qtyOnHand: { decrement: item.quantity } },
          });

          itemAllocationsMap.set(item.productId, null);
        }
      }

      // e. Lock prices from server records and compute financial totals
      let subtotalDecimal = new Prisma.Decimal(0);
      const orderItemsToCreate = sortedItems.map((item) => {
        const unitPrice = new Prisma.Decimal(item.product.price);
        const lineSubtotal = unitPrice.mul(item.quantity);
        subtotalDecimal = subtotalDecimal.add(lineSubtotal);

        return {
          productId: item.productId,
          quantity: item.quantity,
          price: unitPrice,
          subtotal: lineSubtotal,
        };
      });

      const shippingCostDecimal = new Prisma.Decimal(0);
      const totalDecimal = subtotalDecimal.add(shippingCostDecimal);

      // f. Generate unique order number from sequence
      const orderNumber = await this.orderDb.generateOrderNumber(tx);

      // g. Set payment expiration to now + 5 minutes
      const paymentExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // h. Create Order, OrderItems, and OrderAddress in DB
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
          deliveryType: dto.deliveryType,
          subtotal: subtotalDecimal,
          shippingCost: shippingCostDecimal,
          total: totalDecimal,
          pickupScheduledAt: dto.pickupScheduledAt
            ? new Date(dto.pickupScheduledAt)
            : null,
          paymentExpiresAt,
          customerNotes: dto.customerNotes?.trim() || null,
          ...(resolvedAddress
            ? {
                address: {
                  create: {
                    addressLine: resolvedAddress.addressLine,
                    city: resolvedAddress.city,
                    county: resolvedAddress.county,
                    postcode: resolvedAddress.postcode,
                  },
                },
              }
            : {}),
          items: {
            create: orderItemsToCreate,
          },
        },
        include: {
          items: true,
          address: true,
        },
      });

      // i. Record CONSUMED inventory transactions for each order item and refresh status
      for (const createdItem of order.items) {
        const allocations = itemAllocationsMap.get(createdItem.productId);
        const inv = itemInventoryMap.get(createdItem.productId)!;

        const note = allocations
          ? JSON.stringify({ allocations })
          : `Consumed by order ${order.orderNumber}`;

        await tx.inventoryTransaction.create({
          data: {
            inventoryId: inv.id,
            type: TransactionType.CONSUMED,
            quantity: createdItem.quantity,
            orderItemId: createdItem.id,
            performedBy: user.name || user.email,
            note,
          },
        });

        await this.inventoryDb.refreshInventoryStatus(inv.id, tx);
      }

      // j. Clear user's cart items via CartService helper
      await this.cartService.clearCartForOrder(userId, tx);

      // k. Fetch complete order record with relations for response (including batchAllocations)
      const completeOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: this.orderDb.orderDetailInclude,
      });

      return completeOrder!;
    });

    // 3. Post-commit side effects (fire-and-forget)
    this.logger.log(
      `Order placed successfully: ${createdOrder.orderNumber} (${createdOrder.id}) for user ${user.email}`,
    );

    // Audit log
    this.auditService
      .log({
        entityType: 'ORDER',
        entityId: createdOrder.id,
        action: 'CREATE_ORDER',
        actorType: AuditActorType.USER,
        actorId: user.id,
        details: {
          orderNumber: createdOrder.orderNumber,
          total: createdOrder.total.toString(),
          deliveryType: createdOrder.deliveryType,
          itemCount: createdOrder.items.length,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record order audit log: ${(err as Error).message}`,
        );
      });

    // Notify admins about new order (fire-and-forget, docs 01 §14)
    this.notificationService
      .dispatchAdminNotification({
        title: 'New Order Received',
        message: `Order #${createdOrder.orderNumber} for £${createdOrder.total.toString()} placed by ${user.name || user.email}.`,
        referenceId: createdOrder.id,
        referenceEvent: 'ORDER_CREATED',
      })
      .catch((err) => {
        this.logger.error(
          `Failed to dispatch new order notification to admins: ${(err as Error).message}`,
        );
      });

    return toOrderResponse(createdOrder);
  }
}
