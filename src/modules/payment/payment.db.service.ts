import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ICreatePaymentData, PaymentWithOrder, paymentInclude } from './types';

/**
 * All Prisma queries for the payment domain live here.
 * Business logic stays in the service layer.
 * Verified against docs: 04 §5.
 */
@Injectable()
export class PaymentDbService {
  private readonly logger = new Logger(PaymentDbService.name);

  constructor(private readonly db: DatabaseService) {}

  private getClient(
    tx?: Prisma.TransactionClient,
  ): Prisma.TransactionClient | DatabaseService {
    return tx ?? this.db;
  }

  /**
   * Finds the latest UNPAID payment for an order.
   * Used during initiate to reuse an existing payment intent (idempotency).
   * Verified against docs: 01 §15.
   */
  async findUnpaidByOrderId(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentWithOrder | null> {
    const client = this.getClient(tx);
    return client.payment.findFirst({
      where: { orderId, status: PaymentStatus.UNPAID },
      include: paymentInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Finds a payment by its gateway reference (gatewayRef @unique).
   * Used by webhook handler to locate the payment record.
   */
  async findByGatewayRef(
    gatewayRef: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentWithOrder | null> {
    const client = this.getClient(tx);
    return client.payment.findUnique({
      where: { gatewayRef },
      include: paymentInclude,
    });
  }

  /**
   * Finds a payment by its ID and validates it belongs to the order.
   * Used by mock-complete endpoint for ownership enforcement.
   */
  async findByIdAndOrderId(
    paymentId: string,
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentWithOrder | null> {
    const client = this.getClient(tx);
    return client.payment.findFirst({
      where: { id: paymentId, orderId },
      include: paymentInclude,
    });
  }

  /**
   * Finds a payment by its ID and validates it belongs to an order owned by the user.
   * Used for IDOR protection on payment endpoints (e.g. mock-complete).
   */
  async findByIdAndUserId(
    paymentId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentWithOrder | null> {
    const client = this.getClient(tx);
    return client.payment.findFirst({
      where: {
        id: paymentId,
        order: { userId },
      },
      include: paymentInclude,
    });
  }

  /**
   * Finds all REFUND_PENDING orders that need their payment refunded.
   * Used by the refund retry cron to pick up stalled refunds.
   * Verified against docs: 01 §20, 11 §6.
   */
  async findRefundPendingOrders(
    limit: number = 20,
    tx?: Prisma.TransactionClient,
  ): Promise<
    Array<{
      id: string;
      userId: string;
      orderNumber: string;
      total: Prisma.Decimal;
      confirmedAt: Date | null;
      payments: Array<{ id: string; gatewayRef: string; status: PaymentStatus; amount: Prisma.Decimal }>;
    }>
  > {
    const client = this.getClient(tx);
    return client.order.findMany({
      where: { status: 'REFUND_PENDING' },
      take: limit,
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        total: true,
        confirmedAt: true,
        payments: {
          where: { status: PaymentStatus.PAID },
          select: { id: true, gatewayRef: true, status: true, amount: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  /**
   * Creates a new payment record (UNPAID) in the database.
   * gatewayRef @unique: if two parallel calls race, the second gets a 409
   * which is caught and surfaced as a ConflictException.
   * Verified against docs: 01 §15.
   */
  async createPayment(
    data: ICreatePaymentData,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentWithOrder> {
    const client = this.getClient(tx);
    try {
      return await client.payment.create({
        data: {
          orderId: data.orderId,
          amount: data.amount,
          gatewayRef: data.gatewayRef,
          method: data.method as any,
          provider: data.provider as any,
          status: PaymentStatus.UNPAID,
        },
        include: paymentInclude,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A payment record with this gateway reference already exists.',
        );
      }
      this.logger.error(
        `Failed to create payment record: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to create payment record.');
    }
  }

  /**
   * Transitions payment from UNPAID/FAILED → PAID using an optimistic concurrency guard.
   * Also updates order status to CONFIRMED + paymentStatus PAID, sets confirmedAt,
   * and increments user.totalOrders + totalSpent atomically in the same transaction.
   *
   * Returns true if the update actually changed rows; false = already processed (skip).
   * Verified against docs: 01 §16 (payment_intent.succeeded), 01 §2.9.
   */
  async confirmPaymentInTx(
    gatewayRef: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ updated: boolean; payment: PaymentWithOrder | null }> {
    // Guarded update: only transitions from UNPAID or FAILED → PAID
    const result = await tx.payment.updateMany({
      where: {
        gatewayRef,
        status: { in: [PaymentStatus.UNPAID, PaymentStatus.FAILED] },
      },
      data: {
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      },
    });

    if (result.count === 0) {
      // Already PAID, CANCELED, or REFUNDED — idempotent skip
      return { updated: false, payment: null };
    }

    // Fetch updated payment with order data
    const payment = await tx.payment.findUnique({
      where: { gatewayRef },
      include: paymentInclude,
    });

    return { updated: true, payment };
  }

  /**
   * Transitions payment from PAID → REFUNDED using a guarded update.
   * Also finalises order status: REFUND_PENDING → CANCELLED, paymentStatus REFUNDED.
   * Decrements user.totalSpent by order.total.
   *
   * Returns true if rows changed; false = already refunded (safe to skip/retry).
   * Verified against docs: 01 §20, 01 §16 (charge.refunded handler).
   */
  async processRefundInTx(
    paymentId: string,
    orderId: string,
    userId: string,
    orderTotal: Prisma.Decimal,
    isConfirmed: boolean,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    // Guarded update: only PAID → REFUNDED
    const result = await tx.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PAID },
      data: {
        status: PaymentStatus.REFUNDED,
        refundedAt: new Date(),
      },
    });

    if (result.count === 0) {
      // Already refunded — idempotent, safe to return false
      return false;
    }

    // Finalise order: REFUND_PENDING → CANCELLED, paymentStatus → REFUNDED
    await tx.order.updateMany({
      where: { id: orderId, status: 'REFUND_PENDING' },
      data: {
        status: 'CANCELLED',
        paymentStatus: PaymentStatus.REFUNDED,
        cancelledAt: new Date(),
      },
    });

    // Decrement user totalSpent only if the order was confirmed and spent was credited
    if (isConfirmed) {
      await tx.user.update({
        where: { id: userId },
        data: {
          totalSpent: { decrement: orderTotal },
        },
      });
    }

    return true;
  }

  /**
   * Marks payment as FAILED (from UNPAID). Used by payment_failed webhook event.
   * Order remains PENDING so customer can retry payment.
   * Verified against docs: 01 §16.
   */
  async markPaymentFailed(
    gatewayRef: string,
    failureReason?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    const result = await client.payment.updateMany({
      where: { gatewayRef, status: PaymentStatus.UNPAID },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: failureReason ?? null,
      },
    });
    return result.count > 0;
  }

  /**
   * Marks payment as CANCELED (from UNPAID). Used by payment_intent.canceled webhook.
   * Verified against docs: 01 §16.
   */
  async markPaymentCanceled(
    gatewayRef: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = this.getClient(tx);
    const result = await client.payment.updateMany({
      where: { gatewayRef, status: PaymentStatus.UNPAID },
      data: { status: PaymentStatus.CANCELED },
    });
    return result.count > 0;
  }

  /**
   * Runs an interactive DB transaction.
   */
  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn);
  }
}
