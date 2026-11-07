import {
  Inventory as PrismaInventory,
  InventoryBatch as PrismaInventoryBatch,
  InventoryTransaction as PrismaInventoryTransaction,
  Product as PrismaProduct,
  Category as PrismaCategory,
  StockStatus,
  BatchStatus,
  TransactionType,
  AdjustmentReason,
} from '@prisma/client';
import { PaginationMeta } from '../../../common/pagination';

export type InventoryWithRelations = PrismaInventory & {
  product: PrismaProduct & {
    category?: PrismaCategory | null;
  };
  batches?: PrismaInventoryBatch[];
  transactions?: PrismaInventoryTransaction[];
  _count?: {
    batches?: number;
    transactions?: number;
  };
};

export interface IInventoryBatch {
  id: string;
  batchCode: string;
  qtyOnHand: number;
  expiryDate: Date;
  status: BatchStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInventoryTransaction {
  id: string;
  inventoryId: string;
  type: TransactionType;
  quantity: number;
  reason: AdjustmentReason | null;
  note: string | null;
  performedBy: string | null;
  orderItemId: string | null;
  productName?: string;
  productSku?: string;
  createdAt: Date;
}

export interface IInventoryResponse {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productSlug: string;
  price: string;
  categoryName?: string | null;
  batchTracked: boolean;
  qtyOnHand: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  batches: IInventoryBatch[];
  recentTransactions: IInventoryTransaction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IInventorySummary {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productSlug: string;
  price: string;
  categoryName?: string | null;
  batchTracked: boolean;
  qtyOnHand: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  batchCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInventoryListResponse {
  data: IInventorySummary[];
  meta: PaginationMeta;
}

export interface ITransactionListResponse {
  data: IInventoryTransaction[];
  meta: PaginationMeta;
}

export interface IAvailableProduct {
  id: string;
  name: string;
  sku: string;
  slug: string;
  price: string;
  batchTracked: boolean;
  categoryName?: string | null;
}

export interface IAvailableProductListResponse {
  data: IAvailableProduct[];
  meta: PaginationMeta;
}
