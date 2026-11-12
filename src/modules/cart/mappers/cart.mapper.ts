import { Prisma, StockStatus } from '@prisma/client';
import {
  CartItemStockInfo,
  CartItemWithProduct,
  CartWithRelations,
  ICartItemProduct,
  ICartItemResponse,
  ICartResponse,
} from '../types';
import { toDecimalString } from '../../../common/utils/decimal';

/**
 * Maps a CartItem database record with its relations to ICartItemResponse.
 * Uses stock and availability data evaluated by the service layer.
 */
export function toCartItemResponse(
  item: CartItemWithProduct,
  stockInfo?: CartItemStockInfo,
): ICartItemResponse {
  const product = item.product;

  const availableStock =
    stockInfo?.availableStock ??
    (product.inventory ? Math.max(0, product.inventory.qtyOnHand) : 0);
  const isAvailable =
    stockInfo?.isAvailable ?? (product.isActive && product.isVisible);
  const maxAllowedQuantity =
    stockInfo?.maxAllowedQuantity ?? product.maximumOrderQuantity;

  const primaryImage =
    product.images?.find((img) => img.isPrimary) || product.images?.[0] || null;

  const unitPriceDecimal = new Prisma.Decimal(product.price);
  const lineSubtotalDecimal = unitPriceDecimal.mul(item.quantity);

  const productResponse: ICartItemProduct = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    price: toDecimalString(product.price),
    imageUrl: primaryImage?.url ?? null,
    storageType: product.storageType,
    unitOfMeasure: product.unitOfMeasure,
    minimumOrderQuantity: product.minimumOrderQuantity,
    maximumOrderQuantity: product.maximumOrderQuantity,
    isActive: product.isActive,
    isVisible: product.isVisible,
    stockStatus: product.inventory?.stockStatus ?? StockStatus.OUT_OF_STOCK,
    availableStock,
  };

  return {
    id: item.id,
    cartId: item.cartId,
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: toDecimalString(product.price),
    subtotal: lineSubtotalDecimal.toFixed(2),
    isAvailable,
    maxAllowedQuantity,
    product: productResponse,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * Maps a Cart database record with all relations to ICartResponse.
 * Accepts an optional map of precomputed stock information from the service layer.
 */
export function toCartResponse(
  cart: CartWithRelations,
  stockInfoMap?: Map<string, CartItemStockInfo>,
): ICartResponse {
  let subtotalDecimal = new Prisma.Decimal(0);
  let totalQuantity = 0;

  const items = (cart.items || []).map((item) => {
    const stockInfo = stockInfoMap?.get(item.id);
    const itemResponse = toCartItemResponse(item, stockInfo);
    totalQuantity += item.quantity;
    subtotalDecimal = subtotalDecimal.add(
      new Prisma.Decimal(item.product.price).mul(item.quantity),
    );
    return itemResponse;
  });

  const subtotalString = subtotalDecimal.toFixed(2);
  const shippingCostString = '0.00';
  const grandTotalString = subtotalString;

  return {
    id: cart.id,
    userId: cart.userId,
    items,
    itemCount: items.length,
    totalQuantity,
    subtotal: subtotalString,
    shippingCost: shippingCostString,
    grandTotal: grandTotalString,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
}
