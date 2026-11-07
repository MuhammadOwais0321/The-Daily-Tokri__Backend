import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { BatchStatus, Prisma, StockStatus } from '@prisma/client';
import { InventoryQueryDto, InventoryTransactionsQueryDto } from './dto';
import { InventoryWithRelations } from './types';

@Injectable()
export class InventoryDbService {
  constructor(private readonly db: DatabaseService) {}

  private readonly inventoryInclude = {
    product: {
      include: {
        category: true,
      },
    },
    batches: {
      orderBy: { expiryDate: 'asc' as const },
    },
    transactions: {
      orderBy: { createdAt: 'desc' as const },
      take: 20,
    },
    _count: {
      select: {
        batches: true,
        transactions: true,
      },
    },
  };

  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn);
  }

  async findById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryWithRelations | null> {
    const client = tx ?? this.db;
    return client.inventory.findUnique({
      where: { id },
      include: this.inventoryInclude,
    });
  }

  async findByProductId(
    productId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryWithRelations | null> {
    const client = tx ?? this.db;
    return client.inventory.findUnique({
      where: { productId },
      include: this.inventoryInclude,
    });
  }

  async findBatchById(batchId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.db;
    return client.inventoryBatch.findUnique({
      where: { id: batchId },
    });
  }

  async findExpiredActiveBatches(
    today: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.inventoryBatch.findMany({
      where: {
        status: BatchStatus.ACTIVE,
        expiryDate: {
          lt: today,
        },
      },
      include: {
        inventory: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                batchTracked: true,
              },
            },
          },
        },
      },
      orderBy: {
        expiryDate: 'asc',
      },
    });
  }

  async expireActiveBatch(
    batchId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.db;
    const result = await client.inventoryBatch.updateMany({
      where: {
        id: batchId,
        status: BatchStatus.ACTIVE,
      },
      data: {
        status: BatchStatus.EXPIRED,
      },
    });
    return result.count;
  }

  async lockInventoryRow(
    id: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "inventory" WHERE id = ${id} FOR UPDATE;`,
    );
  }

  async lockBatchRow(id: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "inventory_batches" WHERE id = ${id} FOR UPDATE;`,
    );
  }

  async findMany(
    query: InventoryQueryDto,
  ): Promise<{ data: InventoryWithRelations[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryWhereInput = {};

    if (query.stockStatus) {
      where.stockStatus = query.stockStatus;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.product = {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { barcode: { contains: term, mode: 'insensitive' } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.db.inventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: this.inventoryInclude,
      }),
      this.db.inventory.count({ where }),
    ]);

    return {
      data,
      total,
    };
  }

  async findAvailableProducts(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      inventory: null,
    };

    const [data, total] = await Promise.all([
      this.db.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          category: true,
        },
      }),
      this.db.product.count({ where }),
    ]);

    return { data, total };
  }

  async findTransactions(query: InventoryTransactionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryTransactionWhereInput = {};

    const inventoryWhere: Prisma.InventoryWhereInput = {};

    if (query.productId) {
      inventoryWhere.productId = query.productId;
    }

    if (query.q?.trim()) {
      const term = query.q.trim();
      inventoryWhere.product = {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
        ],
      };
    }

    if (Object.keys(inventoryWhere).length > 0) {
      where.inventory = inventoryWhere;
    }

    if (query.inventoryId) {
      where.inventoryId = query.inventoryId;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const toDate = new Date(query.dateTo);
        // If only YYYY-MM-DD was provided, include the entire day up to 23:59:59.999Z
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.dateTo)) {
          toDate.setUTCHours(23, 59, 59, 999);
        }
        where.createdAt.lte = toDate;
      }
    }

    const [data, total] = await Promise.all([
      this.db.inventoryTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          inventory: {
            include: {
              product: {
                select: {
                  name: true,
                  sku: true,
                },
              },
            },
          },
        },
      }),
      this.db.inventoryTransaction.count({ where }),
    ]);

    return { data, total };
  }

  async findTransactionsByInventoryId(
    inventoryId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryTransactionWhereInput = {
      inventoryId,
    };

    const [data, total] = await Promise.all([
      this.db.inventoryTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          inventory: {
            include: {
              product: {
                select: {
                  name: true,
                  sku: true,
                },
              },
            },
          },
        },
      }),
      this.db.inventoryTransaction.count({ where }),
    ]);

    return { data, total };
  }

  async createInventory(
    data: Prisma.InventoryUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.inventory.create({
      data,
      include: this.inventoryInclude,
    });
  }

  async createBatch(
    data: Prisma.InventoryBatchUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.inventoryBatch.create({
      data,
    });
  }

  async createTransaction(
    data: Prisma.InventoryTransactionUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.inventoryTransaction.create({
      data,
    });
  }

  async updateInventory(
    id: string,
    data: Prisma.InventoryUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.inventory.update({
      where: { id },
      data,
      include: this.inventoryInclude,
    });
  }

  async updateBatch(
    id: string,
    data: Prisma.InventoryBatchUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.inventoryBatch.update({
      where: { id },
      data,
    });
  }

  /**
   * Refreshes the inventory stock status based on available stock and lowStockThreshold.
   * If product is batchTracked, available stock is the sum of qtyOnHand of all ACTIVE non-expired batches.
   * Otherwise, available stock is inventory.qtyOnHand.
   */
  async refreshInventoryStatus(
    inventoryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<StockStatus> {
    const client = tx ?? this.db;

    const inventory = await client.inventory.findUnique({
      where: { id: inventoryId },
      include: {
        product: { select: { batchTracked: true } },
        batches: {
          where: { status: BatchStatus.ACTIVE },
        },
      },
    });

    if (!inventory) {
      return StockStatus.OUT_OF_STOCK;
    }

    let availableStock = 0;

    if (inventory.product.batchTracked) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeNonExpiredBatches = inventory.batches.filter(
        (batch) => new Date(batch.expiryDate) >= today,
      );

      availableStock = activeNonExpiredBatches.reduce(
        (sum, batch) => sum + batch.qtyOnHand,
        0,
      );
    } else {
      availableStock = inventory.qtyOnHand;
    }

    let nextStatus: StockStatus;
    if (availableStock <= 0) {
      nextStatus = StockStatus.OUT_OF_STOCK;
    } else if (availableStock <= inventory.lowStockThreshold) {
      nextStatus = StockStatus.LOW_STOCK;
    } else {
      nextStatus = StockStatus.IN_STOCK;
    }

    if (inventory.stockStatus !== nextStatus) {
      await client.inventory.update({
        where: { id: inventoryId },
        data: { stockStatus: nextStatus },
      });
    }

    return nextStatus;
  }
}
