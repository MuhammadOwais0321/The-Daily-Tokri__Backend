import {
  Product as PrismaProduct,
  ProductImage as PrismaProductImage,
  ProductAllergen as PrismaProductAllergen,
  Category as PrismaCategory,
  Brand as PrismaBrand,
  Supplier as PrismaSupplier,
  Inventory as PrismaInventory,
  StorageType,
  UnitOfMeasure,
  AllergenPresence,
  StockStatus,
} from '@prisma/client';
import { PaginationMeta } from '../../../common/pagination';

export type ProductWithRelations = PrismaProduct & {
  category?: PrismaCategory | null;
  brand?: PrismaBrand | null;
  supplier?: PrismaSupplier | null;
  images?: PrismaProductImage[];
  allergens?: PrismaProductAllergen[];
  inventory?: PrismaInventory | null;
};

export interface IProductImage {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: Date;
}

export interface IProductAllergen {
  id: string;
  allergen: string;
  presence: AllergenPresence;
  createdAt: Date;
}

/**
 * Public product detail response.
 * Sensitive admin fields (supplierId, supplier, qtyOnHand, barcode, batchTracked, isActive, isVisible)
 * are excluded.
 */
export interface IPublicProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  price: string;
  minimumOrderQuantity: number;
  maximumOrderQuantity: number;
  storageType: StorageType;
  shelfLifeDays: number | null;
  unitOfMeasure: UnitOfMeasure;
  categoryId: string;
  category?: {
    id: string;
    name: string;
    slug: string;
    depth: number;
  } | null;
  brandId: string | null;
  brand?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  stockStatus?: StockStatus | string;
  images: IProductImage[];
  allergens: IProductAllergen[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Admin product detail response.
 * Includes complete internal details like supplier, qtyOnHand, barcode, batch tracking, and visibility flags.
 */
export interface IAdminProduct extends IPublicProduct {
  barcode: string | null;
  batchTracked: boolean;
  isActive: boolean;
  isVisible: boolean;
  supplierId: string | null;
  supplier?: {
    id: string;
    name: string;
  } | null;
  qtyOnHand?: number;
}

export type IProduct = IAdminProduct;

/**
 * Public product summary item in listings.
 * Internal fields like barcode, isActive, isVisible, qtyOnHand, supplier are excluded.
 */
export interface IPublicProductSummary {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: string;
  minimumOrderQuantity: number;
  maximumOrderQuantity: number;
  storageType: StorageType;
  unitOfMeasure: UnitOfMeasure;
  categoryId: string;
  categoryName?: string;
  categorySlug?: string;
  brandName?: string | null;
  primaryImage?: string | null;
  stockStatus?: StockStatus | string;
  createdAt: Date;
}

/**
 * Admin product summary item in admin listings.
 * Includes barcode, isActive, isVisible, qtyOnHand, and supplierName.
 */
export interface IAdminProductSummary extends IPublicProductSummary {
  barcode: string | null;
  isActive: boolean;
  isVisible: boolean;
  qtyOnHand?: number;
  supplierName?: string | null;
}

export type IProductSummary = IAdminProductSummary;

export interface IPublicProductListResponse {
  data: IPublicProductSummary[];
  meta: PaginationMeta;
}

export interface IAdminProductListResponse {
  data: IAdminProductSummary[];
  meta: PaginationMeta;
}

export type IProductListResponse = IAdminProductListResponse;
