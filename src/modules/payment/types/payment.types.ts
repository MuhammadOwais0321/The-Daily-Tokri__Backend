import { PaymentStatus, Prisma } from '@prisma/client';

export const paymentInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      status: true,
      total: true,
      confirmedAt: true,
    },
  },
} as const;

export type PaymentWithOrder = Prisma.PaymentGetPayload<{
  include: typeof paymentInclude;
}>;

export interface IInitiatePaymentResponse {
  paymentId: string;
  gatewayRef: string;
  amount: string;
  status: PaymentStatus;
  orderId: string;
  orderNumber: string;
}

export interface IMockCompleteResponse {
  paymentId: string;
  status: PaymentStatus;
  orderId: string;
  orderNumber: string;
}

export interface ICreatePaymentData {
  orderId: string;
  amount: Prisma.Decimal;
  gatewayRef: string;
  method: string;
  provider: string;
}

export interface IConfirmPaymentResult {
  alreadyProcessed: boolean;
}

export interface IRefundPaymentResult {
  success: boolean;
  alreadyRefunded: boolean;
}
