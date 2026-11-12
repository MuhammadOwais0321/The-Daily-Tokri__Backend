import {
  Prisma,
  StockStatus,
  StorageType,
  UnitOfMeasure,
} from '@prisma/client';

export type CartWithRelations = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        product: {
          include: {
            images: true;
            inventory: {
              include: {
                batches: true;
              };
            };
          };
        };
      };
    };
  };
}>;

export type CartItemWithProduct = Prisma.CartItemGetPayload<{
  include: {
    product: {
      include: {
        images: true;
        inventory: {
          include: {
            batches: true;
          };
        };
      };
    };
  };
}>;

export interface CartItemStockInfo {
  availableStock: number;
  isAvailable: boolean;
  maxAllowedQuantity: number;
}

export interface ICartItemProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: string;
  imageUrl: string | null;
  storageType: StorageType;
  unitOfMeasure: UnitOfMeasure;
  minimumOrderQuantity: number;
  maximumOrderQuantity: number;
  isActive: boolean;
  isVisible: boolean;
  stockStatus: StockStatus;
  availableStock: number;
}

export interface ICartItemResponse {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  isAvailable: boolean;
  maxAllowedQuantity: number;
  product: ICartItemProduct;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICartResponse {
  id: string;
  userId: string;
  items: ICartItemResponse[];
  itemCount: number;
  totalQuantity: number;
  subtotal: string;
  shippingCost: string;
  grandTotal: string;
  createdAt: Date;
  updatedAt: Date;
}
