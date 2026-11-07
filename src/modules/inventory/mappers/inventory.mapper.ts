import {
  InventoryBatch as PrismaInventoryBatch,
  InventoryTransaction as PrismaInventoryTransaction,
  Product as PrismaProduct,
  Category as PrismaCategory,
} from '@prisma/client';
import {
  IInventoryBatch,
  IInventoryTransaction,
  IInventoryResponse,
  IInventorySummary,
  IAvailableProduct,
  InventoryWithRelations,
} from '../types';
import { toDecimalString } from '../../../common/utils';

export { toDecimalString };

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

export function toInventoryTransaction(
  tx: PrismaInventoryTransaction & {
    inventory?: {
      product?: {
        name: string;
        sku: string;
      };
    };
  },
): IInventoryTransaction {
  return {
    id: tx.id,
    inventoryId: tx.inventoryId,
    type: tx.type,
    quantity: tx.quantity,
    reason: tx.reason ?? null,
    note: tx.note ?? null,
    performedBy: tx.performedBy ?? null,
    orderItemId: tx.orderItemId ?? null,
    productName: tx.inventory?.product?.name,
    productSku: tx.inventory?.product?.sku,
    createdAt: tx.createdAt,
  };
}

export function toInventoryResponse(
  inventory: InventoryWithRelations,
): IInventoryResponse {
  const batches = (inventory.batches || [])
    .slice()
    .sort(
      (a, b) =>
        new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
    )
    .map(toInventoryBatch);

  const recentTransactions = (inventory.transactions || [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .map((tx) =>
      toInventoryTransaction({
        ...tx,
        inventory: {
          product: {
            name: inventory.product.name,
            sku: inventory.product.sku,
          },
        },
      }),
    );

  return {
    id: inventory.id,
    productId: inventory.productId,
    productName: inventory.product.name,
    productSku: inventory.product.sku,
    productSlug: inventory.product.slug,
    price: toDecimalString(inventory.product.price),
    categoryName: inventory.product.category?.name ?? null,
    batchTracked: inventory.product.batchTracked,
    qtyOnHand: inventory.qtyOnHand,
    lowStockThreshold: inventory.lowStockThreshold,
    stockStatus: inventory.stockStatus,
    batches,
    recentTransactions,
    createdAt: inventory.createdAt,
    updatedAt: inventory.updatedAt,
  };
}

export function toInventorySummary(
  inventory: InventoryWithRelations,
): IInventorySummary {
  return {
    id: inventory.id,
    productId: inventory.productId,
    productName: inventory.product.name,
    productSku: inventory.product.sku,
    productSlug: inventory.product.slug,
    price: toDecimalString(inventory.product.price),
    categoryName: inventory.product.category?.name ?? null,
    batchTracked: inventory.product.batchTracked,
    qtyOnHand: inventory.qtyOnHand,
    lowStockThreshold: inventory.lowStockThreshold,
    stockStatus: inventory.stockStatus,
    batchCount: inventory._count?.batches ?? inventory.batches?.length ?? 0,
    createdAt: inventory.createdAt,
    updatedAt: inventory.updatedAt,
  };
}

export function toAvailableProduct(
  product: PrismaProduct & { category?: PrismaCategory | null },
): IAvailableProduct {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    slug: product.slug,
    price: toDecimalString(product.price),
    batchTracked: product.batchTracked,
    categoryName: product.category?.name ?? null,
  };
}
