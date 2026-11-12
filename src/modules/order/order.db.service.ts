import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma, TransactionType } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ListOrdersQueryDto } from './dto';
import { OrderDetailWithRelations, OrderWithRelations } from './types';

@Injectable()
export class OrderDbService {
  private readonly logger = new Logger(OrderDbService.name);

  constructor(private readonly db: DatabaseService) {}

  readonly orderInclude = {
    items: {
      include: {
        product: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' as const },
            },
          },
        },
      },
    },
    address: true,
    user: {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    },
    payments: {
      orderBy: { createdAt: 'desc' as const },
    },
  };

  /**
   * Detail include: includes CONSUMED inventory transactions on order items
   * to extract batch allocation details for warehouse physical picking.
   * Utilizes @@index([orderItemId, type]) to prevent N+1 queries.
   */
  readonly orderDetailInclude = {
    items: {
      include: {
        product: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' as const },
            },
          },
        },
        inventoryTransactions: {
          where: {
            type: TransactionType.CONSUMED,
          },
          select: {
            id: true,
            type: true,
            note: true,
          },
        },
      },
    },
    address: true,
    user: {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    },
    payments: {
      orderBy: { createdAt: 'desc' as const },
    },
  };

  private getClient(
    tx?: Prisma.TransactionClient,
  ): Prisma.TransactionClient | DatabaseService {
    return tx ?? this.db;
  }

  /**
   * Runs an interactive database transaction.
   */
  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn);
  }

  /**
   * Generates the next sequential order number using PostgreSQL DB sequence 'order_number_seq'.
   * Format: ORD-<YEAR>-<000001>
   * Verified against docs: 01 §14, 03 §3.1.
   */
  async generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const result = await tx.$queryRaw<
      Array<{ nextval: bigint | string | number }>
    >(Prisma.sql`SELECT nextval('order_number_seq') as nextval;`);
    const seqNum = Number(result[0]?.nextval ?? 1);
    const year = new Date().getFullYear();
    return `ORD-${year}-${String(seqNum).padStart(6, '0')}`;
  }

  /**
   * Locks the inventory row for a given product with SELECT ... FOR UPDATE.
   * Deterministic lock order must be preserved by sorting productIds beforehand.
   */
  async lockInventoryByProductId(
    productId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "inventory" WHERE "productId" = ${productId} FOR UPDATE;`,
    );
  }

  /**
   * Locks a specific inventory batch row with SELECT ... FOR UPDATE.
   */
  async lockBatchById(
    batchId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "inventory_batches" WHERE id = ${batchId} FOR UPDATE;`,
    );
  }

  /**
   * Finds an order by its ID, optionally enforcing customer ownership (userId).
   * Detail responses load orderDetailInclude containing CONSUMED inventory transactions
   * with zero N+1 overhead via @@index([orderItemId, type]).
   */
  async findById(
    id: string,
    userId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderDetailWithRelations | null> {
    const client = this.getClient(tx);
    const where: Prisma.OrderWhereInput = { id };
    if (userId) {
      where.userId = userId;
    }

    return client.order.findFirst({
      where,
      include: this.orderDetailInclude,
    });
  }

  /**
   * Finds orders with pagination and filtering for customer or admin.
   */
  async findMany(
    query: ListOrdersQueryDto,
    userId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ data: OrderWithRelations[]; total: number }> {
    const client = this.getClient(tx);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (userId) {
      where.userId = userId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.deliveryType) {
      where.deliveryType = query.deliveryType;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      if (userId) {
        // Customer search: only their own order numbers
        where.orderNumber = { contains: term, mode: 'insensitive' };
      } else {
        // Admin search: order number OR customer name/email
        where.OR = [
          { orderNumber: { contains: term, mode: 'insensitive' } },
          { user: { name: { contains: term, mode: 'insensitive' } } },
          { user: { email: { contains: term, mode: 'insensitive' } } },
        ];
      }
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    const sortOrder = (query.sortOrder || 'desc').toLowerCase() as
      'asc' | 'desc';
    let orderBy: Prisma.OrderOrderByWithRelationInput = {
      createdAt: sortOrder,
    };

    if (query.sortBy === 'total') {
      orderBy = { total: sortOrder };
    } else if (query.sortBy === 'status') {
      orderBy = { status: sortOrder };
    } else if (query.sortBy === 'date' || query.sortBy === 'createdAt') {
      orderBy = { createdAt: sortOrder };
    }

    const [data, total] = await Promise.all([
      client.order.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: this.orderInclude,
      }),
      client.order.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Finds orders whose payment window has expired and are still in PENDING status.
   * Scans using @@index([status, paymentExpiresAt]) for high throughput.
   * Verified against docs: 01 §17, 03 §1.
   */
  async findExpiredPendingOrders(
    now: Date = new Date(),
    limit: number = 50,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderWithRelations[]> {
    const client = this.getClient(tx);
    return client.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        paymentExpiresAt: { lt: now },
      },
      take: limit,
      include: this.orderInclude,
    });
  }

  /**
   * Optimistically updates order status guaranteeing the record has not transitioned concurrently.
   * Returns true if successfully updated, false if count === 0.
   */
  async updateStatusGuarded(
    id: string,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
    extraData: Prisma.OrderUpdateInput = {},
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    const result = await client.order.updateMany({
      where: {
        id,
        status: expectedStatus,
      },
      data: {
        status: nextStatus,
        ...extraData,
      },
    });

    return result.count > 0;
  }
}
