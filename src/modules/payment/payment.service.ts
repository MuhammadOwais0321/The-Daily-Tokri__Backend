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
import { IInitiatePaymentResponse, IMockCompleteResponse } from './types';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly paymentDb: PaymentDbService,
    private readonly initiationService: PaymentInitiationService,
    private readonly webhookService: PaymentWebhookService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: IPaymentGateway,
  ) {}

  /** Initiates payment for a customer's `PENDING` order (reuses existing `UNPAID` payment if present). */
  async initiate(
    user: AuthUser,
    dto: InitiatePaymentDto,
  ): Promise<IInitiatePaymentResponse> {
    return this.initiationService.initiatePayment(user, dto.orderId);
  }

  /** Simulates completing a payment via the mock gateway (idempotent on terminal states). */
  async mockComplete(
    user: AuthUser,
    paymentId: string,
    dto: MockCompletePaymentDto,
  ): Promise<IMockCompleteResponse> {
    const payment = await this.paymentDb.findByIdAndUserId(paymentId, user.id);

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

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

    const refreshed = await this.paymentDb.findByIdAndUserId(
      paymentId,
      user.id,
    );

    return toMockCompleteResponse(refreshed ?? payment);
  }

  /** Verifies and routes incoming signed webhook events from the payment gateway. */
  async handleWebhook(
    body: MockWebhookDto,
    signature?: string,
    rawPayload?: string | Buffer | Record<string, any>,
  ): Promise<{ received: boolean }> {
    const event = this.gateway.verifyWebhookSignature(
      rawPayload ?? body,
      signature,
    );

    this.logger.log(
      `[Webhook] Processing verified webhook event: ${event.type} for gatewayRef "${event.gatewayRef}"`,
    );

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
