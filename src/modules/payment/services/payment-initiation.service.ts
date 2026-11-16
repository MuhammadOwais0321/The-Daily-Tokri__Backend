import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PaymentMethod, PaymentProvider } from '../../../common/enums';
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
 * Initiates a payment intent for a customer's `PENDING` order, reusing any existing `UNPAID` payment.
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
    const order = await this.db.order.findFirst({
      where: { id: orderId, userId: user.id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        userId: true,
      },
    });

    if (!order || order.status !== OrderStatus.PENDING) {
      // Return 404 for non-PENDING orders to avoid leaking order state
      throw new NotFoundException('Order not found.');
    }

    if (new Prisma.Decimal(order.total).lte(0)) {
      throw new BadRequestException(
        'Cannot initiate payment for a zero-value order.',
      );
    }

    const existing = await this.paymentDb.findUnpaidByOrderId(order.id);
    if (existing) {
      this.logger.log(
        `Reusing existing UNPAID payment ${existing.id} (${existing.gatewayRef}) for order ${order.orderNumber}`,
      );
      return toInitiatePaymentResponse(existing);
    }

    const amountDecimal = new Prisma.Decimal(order.total);
    const amountPence = amountDecimal.mul(100).toDecimalPlaces(0).toNumber();

    const { gatewayRef } = await this.gateway.createPaymentIntent(
      order.id,
      amountPence,
    );

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
