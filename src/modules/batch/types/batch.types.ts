import {
  BatchStatus,
  Category as PrismaCategory,
  Inventory as PrismaInventory,
  InventoryBatch as PrismaInventoryBatch,
  Product as PrismaProduct,
} from '@prisma/client';
import { PaginationMeta } from '../../../common/pagination';

export type BatchWithInventory = PrismaInventoryBatch & {
  inventory: PrismaInventory & {
    product: PrismaProduct & {
      category?: PrismaCategory | null;
    };
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

export interface IBatchDetail extends IInventoryBatch {
  inventoryId: string;
  productId: string;
  productName: string;
  productSku: string;
  categoryName?: string | null;
}

export interface IBatchListResponse {
  data: IBatchDetail[];
  meta: PaginationMeta;
}
