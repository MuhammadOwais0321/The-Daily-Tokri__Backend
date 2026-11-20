import { Injectable } from '@nestjs/common';
import { BatchStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { BatchQueryDto } from './dto';
import { BatchWithInventory } from './types';

@Injectable()
export class BatchDbService {
  constructor(private readonly db: DatabaseService) {}

  private readonly batchWithInventoryInclude = {
    inventory: {
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
    },
  };

  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn);
  }

  async findById(batchId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.db;
    return client.inventoryBatch.findUnique({
      where: { id: batchId },
    });
  }

  async findByIdWithInventory(
    batchId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BatchWithInventory | null> {
    const client = tx ?? this.db;
    return client.inventoryBatch.findUnique({
      where: { id: batchId },
      include: this.batchWithInventoryInclude,
    });
  }

  async findMany(
    query: BatchQueryDto,
  ): Promise<{ data: BatchWithInventory[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryBatchWhereInput = {};
    const inventoryWhere: Prisma.InventoryWhereInput = {};
    const productWhere: Prisma.ProductWhereInput = {};

    if (query.inventoryId) {
      where.inventoryId = query.inventoryId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.productId) {
      inventoryWhere.productId = query.productId;
    }

    if (query.categoryId) {
      productWhere.categoryId = query.categoryId;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { batchCode: { contains: term, mode: 'insensitive' } },
        {
          inventory: {
            product: {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { sku: { contains: term, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    if (Object.keys(productWhere).length > 0) {
      inventoryWhere.product = productWhere;
    }

    if (Object.keys(inventoryWhere).length > 0) {
      where.inventory = inventoryWhere;
    }

    if (query.expiryFrom || query.expiryTo) {
      where.expiryDate = {};
      if (query.expiryFrom) {
        where.expiryDate.gte = new Date(query.expiryFrom);
      }
      if (query.expiryTo) {
        const toDate = new Date(query.expiryTo);
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.expiryTo)) {
          toDate.setUTCHours(23, 59, 59, 999);
        }
        where.expiryDate.lte = toDate;
      }
    }

    const [data, total] = await Promise.all([
      this.db.inventoryBatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { expiryDate: 'asc' },
        include: this.batchWithInventoryInclude,
      }),
      this.db.inventoryBatch.count({ where }),
    ]);

    return { data, total };
  }

  async create(
    data: Prisma.InventoryBatchUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.inventoryBatch.create({
      data,
    });
  }

  async update(
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

  async lockRow(id: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "inventory_batches" WHERE id = ${id} FOR UPDATE;`,
    );
  }

  async findExpiredActiveBatches(today: Date, tx?: Prisma.TransactionClient) {
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
}
