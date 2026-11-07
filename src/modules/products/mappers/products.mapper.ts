import { ProductImage, ProductAllergen } from '@prisma/client';
import {
  IProductImage,
  IProductAllergen,
  IPublicProduct,
  IAdminProduct,
  IPublicProductSummary,
  IAdminProductSummary,
  ProductWithRelations,
} from '../types';
import { toDecimalString } from '../../../common/utils';

export { toDecimalString };

export function toProductImage(img: ProductImage): IProductImage {
  return {
    id: img.id,
    url: img.url,
    altText: img.altText ?? null,
    sortOrder: img.sortOrder,
    isPrimary: img.isPrimary,
    createdAt: img.createdAt,
  };
}

export function toProductAllergen(alg: ProductAllergen): IProductAllergen {
  return {
    id: alg.id,
    allergen: alg.allergen,
    presence: alg.presence,
    createdAt: alg.createdAt,
  };
}

/**
 * Maps a product entity to a public customer response.
 * Strips out sensitive admin fields:
 * - supplierId / supplier
 * - qtyOnHand (only stockStatus is provided)
 * - barcode
 * - batchTracked
 * - isActive / isVisible
 */
export function toPublicProductResponse(
  product: ProductWithRelations,
): IPublicProduct {
  const sortedImages = (product.images || [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(toProductImage);

  const allergens = (product.allergens || []).map(toProductAllergen);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    description: product.description ?? null,
    price: toDecimalString(product.price),
    minimumOrderQuantity: product.minimumOrderQuantity,
    maximumOrderQuantity: product.maximumOrderQuantity,
    storageType: product.storageType,
    shelfLifeDays: product.shelfLifeDays ?? null,
    unitOfMeasure: product.unitOfMeasure,
    categoryId: product.categoryId,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
          depth: product.category.depth,
        }
      : null,
    brandId: product.brandId ?? null,
    brand: product.brand
      ? {
          id: product.brand.id,
          name: product.brand.name,
          slug: product.brand.slug,
        }
      : null,
    stockStatus: product.inventory?.stockStatus,
    images: sortedImages,
    allergens,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

/**
 * Maps a product entity to an admin response.
 * Contains all fields including supplier, qtyOnHand, barcode, batchTracked, isActive, isVisible.
 */
export function toAdminProductResponse(
  product: ProductWithRelations,
): IAdminProduct {
  const publicData = toPublicProductResponse(product);

  return {
    ...publicData,
    barcode: product.barcode ?? null,
    batchTracked: product.batchTracked,
    isActive: product.isActive,
    isVisible: product.isVisible,
    supplierId: product.supplierId ?? null,
    supplier: product.supplier
      ? {
          id: product.supplier.id,
          name: product.supplier.name,
        }
      : null,
    qtyOnHand: product.inventory?.qtyOnHand,
  };
}

/** Backward-compatible alias for admin product response */
export const toProductResponse = toAdminProductResponse;

/**
 * Maps a product entity to a public summary for catalog listings.
 * Excludes internal fields (barcode, isActive, isVisible, qtyOnHand, supplier).
 */
export function toPublicProductSummary(
  product: ProductWithRelations,
): IPublicProductSummary {
  const images = product.images || [];
  const primaryImg =
    images.find((img) => img.isPrimary) ||
    images.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0];

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    price: toDecimalString(product.price),
    minimumOrderQuantity: product.minimumOrderQuantity,
    maximumOrderQuantity: product.maximumOrderQuantity,
    storageType: product.storageType,
    unitOfMeasure: product.unitOfMeasure,
    categoryId: product.categoryId,
    categoryName: product.category?.name,
    categorySlug: product.category?.slug,
    brandName: product.brand?.name ?? null,
    primaryImage: primaryImg?.url ?? null,
    stockStatus: product.inventory?.stockStatus,
    createdAt: product.createdAt,
  };
}

/**
 * Maps a product entity to an admin summary with internal inventory and visibility details.
 */
export function toAdminProductSummary(
  product: ProductWithRelations,
): IAdminProductSummary {
  const publicSummary = toPublicProductSummary(product);

  return {
    ...publicSummary,
    barcode: product.barcode ?? null,
    isActive: product.isActive,
    isVisible: product.isVisible,
    qtyOnHand: product.inventory?.qtyOnHand,
    supplierName: product.supplier?.name ?? null,
  };
}

/** Backward-compatible alias for admin product summary */
export const toProductSummary = toAdminProductSummary;
