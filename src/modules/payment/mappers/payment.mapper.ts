import { toDecimalString } from '../../../common/utils/decimal';
import {
  IInitiatePaymentResponse,
  IMockCompleteResponse,
  PaymentWithOrder,
} from '../types';

/** Maps a payment + order record to `IInitiatePaymentResponse`. */
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

/** Maps a payment + order record to `IMockCompleteResponse`. */
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
