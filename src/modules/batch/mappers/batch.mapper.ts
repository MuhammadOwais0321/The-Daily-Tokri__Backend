import { InventoryBatch as PrismaInventoryBatch } from '@prisma/client';
import { BatchWithInventory, IBatchDetail, IInventoryBatch } from '../types';

export function toInventoryBatch(batch: PrismaInventoryBatch): IInventoryBatch {
  return {
    id: batch.id,
    batchCode: batch.batchCode,
    qtyOnHand: batch.qtyOnHand,
    expiryDate: batch.expiryDate,
    status: batch.status,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}

export function toBatchDetail(batch: BatchWithInventory): IBatchDetail {
  return {
    ...toInventoryBatch(batch),
    inventoryId: batch.inventoryId,
    productId: batch.inventory.productId,
    productName: batch.inventory.product.name,
    productSku: batch.inventory.product.sku,
    categoryName: batch.inventory.product.category?.name ?? null,
  };
}
