import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import {
  PAYMENT_GATEWAY,
  type IPaymentGateway,
} from '../../infrastructure/payment/payment-gateway.interface';
import { AuthUser } from '../auth/types';
import {
  InitiatePaymentDto,
  MockCompletePaymentDto,
  MockWebhookDto,
} from './dto';
import { toMockCompleteResponse } from './mappers';
import { PaymentDbService } from './payment.db.service';
import { PaymentInitiationService } from './services/payment-initiation.service';
import { PaymentWebhookService } from './services/payment-webhook.service';
import {
  IInitiatePaymentResponse,
  IMockCompleteResponse,
} from './types';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly paymentDb: PaymentDbService,
    private readonly initiationService: PaymentInitiationService,
    private readonly webhookService: PaymentWebhookService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: IPaymentGateway,
  ) {}

  /**
   * Initiates payment for a customer's PENDING order.
   * Scoped to the authenticated customer; reuses existing UNPAID payment if present.
   * Verified against docs: 01 §15, api-reference Part 2.
   */
  async initiate(
    user: AuthUser,
    dto: InitiatePaymentDto,
  ): Promise<IInitiatePaymentResponse> {
    return this.initiationService.initiatePayment(user, dto.orderId);
  }

  /**
   * Simulates customer completing payment via mock gateway (development / testing).
   * Verified against docs: api-reference Part 2 (POST /payments/:id/mock-complete).
   */
  async mockComplete(
    user: AuthUser,
    paymentId: string,
    dto: MockCompletePaymentDto,
  ): Promise<IMockCompleteResponse> {
    // 1. Verify ownership: payment must belong to an order placed by this user (IDOR protection)
    const payment = await this.paymentDb.findByIdAndUserId(paymentId, user.id);

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    // 2. If already in terminal status, return current status idempotently
    if (
      payment.status === PaymentStatus.PAID ||
      payment.status === PaymentStatus.CANCELED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      this.logger.log(
        `Payment ${payment.id} already in terminal status ${payment.status} — returning current state.`,
      );
      return toMockCompleteResponse(payment);
    }

    // 3. Delegate to webhook logic based on outcome
    if (dto.outcome === 'succeeded') {
      await this.webhookService.handlePaymentSucceeded(payment.gatewayRef);
    } else if (dto.outcome === 'failed') {
      await this.webhookService.handlePaymentFailed(
        payment.gatewayRef,
        dto.failureReason ?? 'Simulated payment failure via mock-complete',
      );
    } else {
      throw new BadRequestException('Invalid outcome specified.');
    }

    // 4. Return refreshed payment record
    const refreshed = await this.paymentDb.findByIdAndUserId(
      paymentId,
      user.id,
    );

    return toMockCompleteResponse(refreshed ?? payment);
  }

  /**
   * Handles incoming signed mock webhook events from the payment gateway.
   * Verified against docs: 01 §16, 10 §3, api-reference Part 2.
   */
  async handleWebhook(
    body: MockWebhookDto,
    signature?: string,
    rawPayload?: string | Buffer | Record<string, any>,
  ): Promise<{ received: boolean }> {
    // 1. Verify HMAC-SHA256 signature using timing-safe comparison
    const event = this.gateway.verifyWebhookSignature(
      rawPayload ?? body,
      signature,
    );

    this.logger.log(
      `[Webhook] Processing verified webhook event: ${event.type} for gatewayRef "${event.gatewayRef}"`,
    );

    // 2. Route event to corresponding handler
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.webhookService.handlePaymentSucceeded(event.gatewayRef);
        break;

      case 'payment_intent.payment_failed':
      case 'payment_intent.failed':
        await this.webhookService.handlePaymentFailed(
          event.gatewayRef,
          event.failureReason,
        );
        break;

      case 'payment_intent.canceled':
        await this.webhookService.handlePaymentCanceled(event.gatewayRef);
        break;

      case 'charge.refunded':
        await this.webhookService.handleChargeRefunded(
          event.gatewayRef,
          event.amountPence,
        );
        break;

      default:
        this.logger.warn(
          `[Webhook] Unhandled event type "${event.type}" — acknowledging receipt.`,
        );
    }

    return { received: true };
  }
}
