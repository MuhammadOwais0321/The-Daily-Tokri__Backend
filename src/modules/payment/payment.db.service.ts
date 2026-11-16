import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ICreatePaymentData, PaymentWithOrder, paymentInclude } from './types';

@Injectable()
export class PaymentDbService {
  private readonly logger = new Logger(PaymentDbService.name);

  constructor(private readonly db: DatabaseService) {}

  private getClient(
    tx?: Prisma.TransactionClient,
  ): Prisma.TransactionClient | DatabaseService {
    return tx ?? this.db;
  }

  /** Finds the latest `UNPAID` payment for an order (used for idempotent payment initiation). */
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

  /** Finds a payment by its unique `gatewayRef`. */
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

  /** Finds a payment by ID and order ID. */
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

  /** Finds a payment by ID scoped to an order owned by `userId`. */
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

  /** Finds `REFUND_PENDING` orders along with their latest `PAID` payment for retry processing. */
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
      payments: Array<{
        id: string;
        gatewayRef: string;
        status: PaymentStatus;
        amount: Prisma.Decimal;
      }>;
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

  /** Creates a new `UNPAID` payment record. */
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
      throw new InternalServerErrorException(
        'Failed to create payment record.',
      );
    }
  }

  /** Transitions payment from `UNPAID`/`FAILED` to `PAID` using a guarded update. */
  async confirmPaymentInTx(
    gatewayRef: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ updated: boolean; payment: PaymentWithOrder | null }> {
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
      return { updated: false, payment: null };
    }

    const payment = await tx.payment.findUnique({
      where: { gatewayRef },
      include: paymentInclude,
    });

    return { updated: true, payment };
  }

  /**
   * Guarded refund transition (`PAID` -> `REFUNDED`): marks order `CANCELLED` + `REFUNDED`
   * and decrements `user.totalSpent` if the order was previously confirmed.
   */
  async processRefundInTx(
    paymentId: string,
    orderId: string,
    userId: string,
    orderTotal: Prisma.Decimal,
    isConfirmed: boolean,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const result = await tx.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PAID },
      data: {
        status: PaymentStatus.REFUNDED,
        refundedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return false;
    }

    await tx.order.updateMany({
      where: { id: orderId, status: 'REFUND_PENDING' },
      data: {
        status: 'CANCELLED',
        paymentStatus: PaymentStatus.REFUNDED,
        cancelledAt: new Date(),
      },
    });

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

  /** Marks an `UNPAID` payment as `FAILED`. */
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

  /** Marks an `UNPAID` payment as `CANCELED`. */
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

  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn);
  }
}
