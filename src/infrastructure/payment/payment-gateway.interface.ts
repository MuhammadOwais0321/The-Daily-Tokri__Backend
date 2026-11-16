/**
 * Payment gateway abstraction for creating intents, issuing refunds, and verifying webhooks.
 */
export interface PaymentGatewayCreateResult {
  gatewayRef: string;
  clientSecret?: string;
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
  /** Creates a payment intent on the gateway for the given order amount in pence. */
  createPaymentIntent(
    orderId: string,
    amountPence: number,
    currency?: string,
  ): Promise<PaymentGatewayCreateResult>;

  /** Issues an idempotent refund on the gateway for the given payment reference. */
  refundPayment(
    gatewayRef: string,
    amountPence: number,
  ): Promise<PaymentGatewayRefundResult>;

  /** Verifies the webhook HMAC signature and returns the parsed event. */
  verifyWebhookSignature(
    rawBody: string | Buffer | Record<string, any>,
    signature?: string,
  ): PaymentGatewayWebhookEvent;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
