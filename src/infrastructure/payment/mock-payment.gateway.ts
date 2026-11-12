import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  PAYMENT_GATEWAY,
  type IPaymentGateway,
  type PaymentGatewayCreateResult,
  type PaymentGatewayRefundResult,
  type PaymentGatewayWebhookEvent,
} from './payment-gateway.interface';

/**
 * Mock payment gateway — simulates a real gateway's behaviour without
 * external dependencies. Implements the same IPaymentGateway interface so
 * the business services never know whether they are talking to Stripe or the mock.
 *
 * Webhook signature: HMAC-SHA256 over JSON body, key = MOCK_PAYMENT_WEBHOOK_SECRET.
 * Header: x-signature
 *
 * Verified against docs: 02 §4, api-reference Part 2 (mock-complete, mock webhook).
 */
@Injectable()
export class MockPaymentGateway implements IPaymentGateway {
  private readonly logger = new Logger(MockPaymentGateway.name);
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.webhookSecret =
      this.configService.get<string>('MOCK_PAYMENT_WEBHOOK_SECRET') ??
      'mock_webhook_secret_default_key_32chars';
  }

  /**
   * Creates a fake payment intent. The returned gatewayRef is the idempotency key
   * used throughout the payment lifecycle and stored as payments.gatewayRef.
   */
  async createPaymentIntent(
    orderId: string,
    amountPence: number,
    currency = 'gbp',
  ): Promise<PaymentGatewayCreateResult> {
    const gatewayRef = `mock_pi_${crypto.randomUUID().replace(/-/g, '')}`;
    this.logger.log(
      `[MockGateway] Created payment intent ${gatewayRef} for order ${orderId}, amount: ${amountPence} ${currency}`,
    );
    return { gatewayRef };
  }

  /**
   * Simulates a refund. Always succeeds to allow easy integration testing.
   * In a real gateway this would call Stripe's refund API.
   */
  async refundPayment(
    gatewayRef: string,
    amountPence: number,
  ): Promise<PaymentGatewayRefundResult> {
    const gatewayRefundRef = `mock_re_${crypto.randomUUID().replace(/-/g, '')}`;
    this.logger.log(
      `[MockGateway] Refunded ${amountPence} pence for ${gatewayRef}, refund ref: ${gatewayRefundRef}`,
    );
    return { refunded: true, gatewayRefundRef };
  }

  /**
   * Verifies HMAC-SHA256 signature using timing-safe comparison.
   * Header expected: x-signature (hex-encoded HMAC).
   * Throws BadRequestException (400) on invalid signature — consistent with docs 10 §3.
   */
  verifyWebhookSignature(
    rawBody: string | Buffer | Record<string, any>,
    signature?: string,
  ): PaymentGatewayWebhookEvent {
    if (!signature || typeof signature !== 'string') {
      throw new BadRequestException('Missing x-signature header.');
    }

    const body =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : JSON.stringify(rawBody);

    const expectedHmac = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');

    let providedHmac: Buffer;
    try {
      providedHmac = Buffer.from(signature, 'hex');
    } catch {
      throw new BadRequestException('Invalid webhook signature format.');
    }

    const expectedBuf = Buffer.from(expectedHmac, 'hex');

    // Constant-time comparison — prevents timing attacks
    if (
      providedHmac.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedHmac, expectedBuf)
    ) {
      throw new BadRequestException('Invalid webhook signature.');
    }

    try {
      return (typeof rawBody === 'object' && !Buffer.isBuffer(rawBody)
        ? rawBody
        : JSON.parse(body)) as PaymentGatewayWebhookEvent;
    } catch {
      throw new BadRequestException('Invalid webhook payload: malformed JSON.');
    }
  }

  /**
   * Helper used by the mock-complete endpoint to generate a signed webhook event.
   * This simulates what the real gateway would POST to our /webhooks endpoint.
   */
  buildSignedWebhookEvent(event: PaymentGatewayWebhookEvent): {
    body: string;
    signature: string;
  } {
    const body = JSON.stringify(event);
    const signature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');
    return { body, signature };
  }
}
