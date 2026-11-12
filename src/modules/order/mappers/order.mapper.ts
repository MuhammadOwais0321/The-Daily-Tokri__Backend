import { toDecimalString } from '../../../common/utils/decimal';
import {
  IBatchAllocation,
  IOrderAddressResponse,
  IOrderItemResponse,
  IOrderPaymentResponse,
  IOrderResponse,
  OrderDetailWithRelations,
  OrderItemWithBatch,
  OrderWithRelations,
} from '../types';

export function toOrderItemResponse(
  item: OrderWithRelations['items'][number] | OrderItemWithBatch,
): IOrderItemResponse {
  const primaryImage =
    item.product?.images?.find((img) => img.isPrimary) ||
    item.product?.images?.[0] ||
    null;

  let batchAllocations: IBatchAllocation[] | undefined = undefined;

  if (
    'inventoryTransactions' in item &&
    item.inventoryTransactions !== undefined
  ) {
    batchAllocations = [];
    const consumedTx =
      item.inventoryTransactions.find((tx) => tx.type === 'CONSUMED') ||
      item.inventoryTransactions[0];

    if (consumedTx?.note && consumedTx.note.startsWith('{')) {
      try {
        const parsed = JSON.parse(consumedTx.note) as {
          allocations?: IBatchAllocation[];
        };
        if (Array.isArray(parsed.allocations)) {
          batchAllocations = parsed.allocations;
        }
      } catch {
        batchAllocations = [];
      }
    }
  }

  return {
    id: item.id,
    orderId: item.orderId,
    productId: item.productId,
    quantity: item.quantity,
    price: toDecimalString(item.price),
    subtotal: toDecimalString(item.subtotal),
    product: item.product
      ? {
          id: item.product.id,
          name: item.product.name,
          slug: item.product.slug,
          sku: item.product.sku,
          imageUrl: primaryImage?.url ?? null,
        }
      : undefined,
    ...(batchAllocations !== undefined ? { batchAllocations } : {}),
    createdAt: item.createdAt,
  };
}

export function toOrderAddressResponse(
  address: OrderWithRelations['address'],
): IOrderAddressResponse | null {
  if (!address) return null;
  return {
    id: address.id,
    orderId: address.orderId,
    addressLine: address.addressLine,
    city: address.city,
    county: address.county,
    postcode: address.postcode,
    createdAt: address.createdAt,
  };
}

export function toOrderPaymentResponse(
  payment: OrderWithRelations['payments'][number],
): IOrderPaymentResponse {
  return {
    id: payment.id,
    gatewayRef: payment.gatewayRef,
    amount: toDecimalString(payment.amount),
    status: payment.status,
    paidAt: payment.paidAt,
    refundedAt: payment.refundedAt,
  };
}

export function toOrderResponse(
  order: OrderWithRelations | OrderDetailWithRelations,
): IOrderResponse {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveryType: order.deliveryType,
    subtotal: toDecimalString(order.subtotal),
    shippingCost: toDecimalString(order.shippingCost),
    total: toDecimalString(order.total),
    pickupScheduledAt: order.pickupScheduledAt,
    paymentExpiresAt: order.paymentExpiresAt,
    customerNotes: order.customerNotes,
    confirmedAt: order.confirmedAt,
    processedAt: order.processedAt,
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
    cancellationNote: order.cancellationNote,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: (order.items || []).map(toOrderItemResponse),
    address: toOrderAddressResponse(order.address),
    user: order.user
      ? {
          id: order.user.id,
          name: order.user.name,
          email: order.user.email,
          phone: order.user.phone,
        }
      : undefined,
    payments: order.payments?.map(toOrderPaymentResponse),
  };
}
