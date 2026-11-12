import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { AuditActorType, PaymentMethod, PaymentProvider } from '../../../common/enums';
import {
  PAYMENT_GATEWAY,
  type IPaymentGateway,
} from '../../../infrastructure/payment/payment-gateway.interface';
import { AuditService } from '../../audit/audit.service';
import { AuthUser } from '../../auth/types';
import { DatabaseService } from '../../../database/database.service';
import { toInitiatePaymentResponse } from '../mappers';
import { PaymentDbService } from '../payment.db.service';
import { IInitiatePaymentResponse } from '../types';

/**
 * Handles POST /payments/initiate.
 *
 * Rules (Docs 01 §15):
 * 1. Order must belong to the authenticated customer and be PENDING.
 * 2. Order total must be > 0.
 * 3. If an UNPAID payment already exists, reuse it (idempotent initiation).
 * 4. Amount set from server's order.total — client amount never trusted.
 * 5. Payment row: method CREDIT_CARD, provider MOCK, status UNPAID.
 */
@Injectable()
export class PaymentInitiationService {
  private readonly logger = new Logger(PaymentInitiationService.name);

  constructor(
    private readonly paymentDb: PaymentDbService,
    private readonly db: DatabaseService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: IPaymentGateway,
    private readonly auditService: AuditService,
  ) {}

  async initiatePayment(
    user: AuthUser,
    orderId: string,
  ): Promise<IInitiatePaymentResponse> {
    // 1. Load order — ownership enforced by filtering on userId
    const order = await this.db.order.findFirst({
      where: { id: orderId, userId: user.id },
      select: { id: true, orderNumber: true, status: true, total: true, userId: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new NotFoundException('Order not found.');
      // Returns 404 intentionally: a non-PENDING order doesn't accept payment.
      // This prevents leaking whether the order exists in another state.
    }

    // 2. Total > 0 guard
    if (new Prisma.Decimal(order.total).lte(0)) {
      throw new BadRequestException(
        'Cannot initiate payment for a zero-value order.',
      );
    }

    // 3. Idempotency: reuse existing UNPAID payment
    const existing = await this.paymentDb.findUnpaidByOrderId(order.id);
    if (existing) {
      this.logger.log(
        `Reusing existing UNPAID payment ${existing.id} (${existing.gatewayRef}) for order ${order.orderNumber}`,
      );
      return toInitiatePaymentResponse(existing);
    }

    // 4. Create payment intent on gateway (amount in pence)
    const amountDecimal = new Prisma.Decimal(order.total);
    const amountPence = amountDecimal.mul(100).toDecimalPlaces(0).toNumber();

    const { gatewayRef } = await this.gateway.createPaymentIntent(
      order.id,
      amountPence,
    );

    // 5. Persist payment row
    const payment = await this.paymentDb.createPayment({
      orderId: order.id,
      amount: amountDecimal,
      gatewayRef,
      method: PaymentMethod.CREDIT_CARD,
      provider: PaymentProvider.MOCK,
    });

    this.logger.log(
      `Payment initiated: ${payment.id} (${gatewayRef}) for order ${order.orderNumber}`,
    );

    // Audit log (fire-and-forget)
    this.auditService
      .log({
        entityType: 'PAYMENT',
        entityId: payment.id,
        action: 'INITIATE_PAYMENT',
        actorType: AuditActorType.USER,
        actorId: user.id,
        details: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          gatewayRef,
          amount: amountDecimal.toFixed(2),
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record payment initiation audit log: ${(err as Error).message}`,
        );
      });

    return toInitiatePaymentResponse(payment);
  }
}
