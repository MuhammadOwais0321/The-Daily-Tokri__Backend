/**
 * Abstract contract for the payment gateway.
 * Infrastructure layer: business logic never calls gateway SDKs directly.
 * Verified against docs: 02 §4 (infrastructure/payment interface pattern).
 *
 * Swap mock → real gateway without touching any business service.
 */
export interface PaymentGatewayCreateResult {
  gatewayRef: string; // Unique payment intent / reference ID from gateway
  clientSecret?: string; // Opaque client token (not used by mock)
}

export interface PaymentGatewayRefundResult {
  refunded: boolean;
  gatewayRefundRef?: string;
}

export interface PaymentGatewayWebhookEvent {
  id: string;
  type: string;
  gatewayRef: string;
  failureReason?: string;
  amountPence?: number;
}

export interface IPaymentGateway {
  /**
   * Creates a payment intent / record on the gateway.
   * @param orderId     Internal order identifier (used as metadata / idempotency key)
   * @param amountPence Amount in smallest currency unit (pence for GBP)
   * @param currency    ISO-4217 currency code (default: 'gbp')
   */
  createPaymentIntent(
    orderId: string,
    amountPence: number,
    currency?: string,
  ): Promise<PaymentGatewayCreateResult>;

  /**
   * Refunds an existing payment on the gateway.
   * Must be idempotent — calling twice must not double-refund.
   * @param gatewayRef  The reference returned by createPaymentIntent
   * @param amountPence Amount to refund in pence
   */
  refundPayment(
    gatewayRef: string,
    amountPence: number,
  ): Promise<PaymentGatewayRefundResult>;

  /**
   * Verifies the HMAC-SHA256 signature of an incoming webhook event.
   * @param rawBody   Raw request body bytes/string or parsed body object
   * @param signature Value of the x-signature header
   * @returns Parsed event if valid; throws BadRequestException if invalid
   */
  verifyWebhookSignature(
    rawBody: string | Buffer | Record<string, any>,
    signature?: string,
  ): PaymentGatewayWebhookEvent;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
