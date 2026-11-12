import { PaymentStatus, Prisma } from '@prisma/client';

// ─── Prisma payload types ─────────────────────────────────────────────────────

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

// ─── API response interfaces ──────────────────────────────────────────────────

/**
 * Response shape returned by POST /payments/initiate.
 * Verified against docs: api-reference Part 2.
 */
export interface IInitiatePaymentResponse {
  paymentId: string;
  gatewayRef: string;
  amount: string; // Decimal string, e.g. "24.99"
  status: PaymentStatus;
  orderId: string;
  orderNumber: string;
}

/**
 * Response shape returned by POST /payments/:id/mock-complete.
 * Verified against docs: api-reference Part 2.
 */
export interface IMockCompleteResponse {
  paymentId: string;
  status: PaymentStatus;
  orderId: string;
  orderNumber: string;
}

// ─── Internal contracts ───────────────────────────────────────────────────────

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
