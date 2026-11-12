import { toDecimalString } from '../../../common/utils/decimal';
import {
  IInitiatePaymentResponse,
  IMockCompleteResponse,
  PaymentWithOrder,
} from '../types';

/**
 * Maps a Payment + Order record to the initiate-payment API response.
 * Money is always returned as a string (Decimal → "12.50").
 * Verified against docs: 04 §7, api-reference Part 2.
 */
export function toInitiatePaymentResponse(
  payment: PaymentWithOrder,
): IInitiatePaymentResponse {
  return {
    paymentId: payment.id,
    gatewayRef: payment.gatewayRef,
    amount: toDecimalString(payment.amount),
    status: payment.status,
    orderId: payment.order.id,
    orderNumber: payment.order.orderNumber,
  };
}

/**
 * Maps a Payment + Order record to the mock-complete API response.
 */
export function toMockCompleteResponse(
  payment: PaymentWithOrder,
): IMockCompleteResponse {
  return {
    paymentId: payment.id,
    status: payment.status,
    orderId: payment.order.id,
    orderNumber: payment.order.orderNumber,
  };
}
