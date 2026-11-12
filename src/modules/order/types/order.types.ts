import {
  DeliveryType,
  OrderStatus,
  PaymentStatus,
  Prisma,
  TransactionType,
} from '@prisma/client';

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' };
            };
          };
        };
      };
    };
    address: true;
    user: {
      select: {
        id: true;
        name: true;
        email: true;
        phone: true;
      };
    };
    payments: {
      orderBy: { createdAt: 'desc' };
    };
  };
}>;

export type OrderItemWithBatch = OrderWithRelations['items'][number] & {
  inventoryTransactions?: Array<{
    id: string;
    type: TransactionType;
    note: string | null;
  }>;
};

export type OrderDetailWithRelations = Omit<OrderWithRelations, 'items'> & {
  items: OrderItemWithBatch[];
};

export interface IBatchAllocation {
  batchId: string;
  batchCode: string;
  quantity: number;
}

export interface IOrderItemProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  imageUrl: string | null;
}

export interface IOrderItemResponse {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: string;
  subtotal: string;
  product?: IOrderItemProduct;
  batchAllocations?: IBatchAllocation[];
  createdAt: Date;
}

export interface IOrderAddressResponse {
  id: string;
  orderId: string;
  addressLine: string;
  city: string;
  county: string;
  postcode: string;
  createdAt: Date;
}

export interface IOrderUserResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface IOrderPaymentResponse {
  id: string;
  gatewayRef: string;
  amount: string;
  status: PaymentStatus;
  paidAt: Date | null;
  refundedAt: Date | null;
}

export interface IOrderResponse {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryType: DeliveryType;
  subtotal: string;
  shippingCost: string;
  total: string;
  pickupScheduledAt: Date | null;
  paymentExpiresAt: Date | null;
  customerNotes: string | null;
  confirmedAt: Date | null;
  processedAt: Date | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  cancellationNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: IOrderItemResponse[];
  address: IOrderAddressResponse | null;
  user?: IOrderUserResponse;
  payments?: IOrderPaymentResponse[];
}

/**
 * Transition rules enforced by OrderStatusService for Admin actions.
 * Verified against docs: 01 §19.
 */
export const ADMIN_ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [], // Only payment webhook confirms
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING],
  [OrderStatus.PROCESSING]: [
    OrderStatus.READY_FOR_PICKUP, // ONLY valid for PICKUP orders
    OrderStatus.READY_FOR_DELIVERY, // ONLY valid for DELIVERY orders
  ],
  [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.DELIVERED],
  [OrderStatus.READY_FOR_DELIVERY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUND_PENDING]: [],
};

/**
 * Statuses from which a customer is permitted to cancel their own order.
 * Verified against docs: 01 §18.
 */
export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
];

/**
 * Statuses from which an admin is permitted to cancel an order.
 * Verified against docs: 01 §20.
 */
export const ADMIN_CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.READY_FOR_DELIVERY,
];
