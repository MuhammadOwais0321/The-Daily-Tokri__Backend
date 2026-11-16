import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  ReviewStatus,
  StockStatus,
  UserRole,
} from '@prisma/client';
import { IPeriodRange } from '../../common/period';
import { DatabaseService } from '../../database/database.service';
import { IRawDashboardSnapshot, IRawPeriodMetrics } from './types';

@Injectable()
export class DashboardDbService {
  private readonly logger = new Logger(DashboardDbService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Aggregates order, revenue, and customer KPI metrics for a UTC date window. */
  private async fetchPeriodMetrics(
    start: Date,
    end: Date,
  ): Promise<IRawPeriodMetrics> {
    const dateFilter: Prisma.DateTimeFilter = { gte: start, lte: end };

    const [totalOrders, paidOrderAgg, newCustomers] = await Promise.all([
      this.db.order.count({
        where: { createdAt: dateFilter },
      }),
      this.db.order.aggregate({
        where: {
          createdAt: dateFilter,
          paymentStatus: PaymentStatus.PAID,
          status: { not: OrderStatus.CANCELLED },
        },
        _count: { id: true },
        _sum: { total: true },
        _avg: { total: true },
      }),
      this.db.user.count({
        where: {
          role: UserRole.CUSTOMER,
          deletedAt: null,
          createdAt: dateFilter,
        },
      }),
    ]);

    return {
      totalOrders,
      paidOrders: paidOrderAgg._count.id,
      revenue: paidOrderAgg._sum.total ?? new Prisma.Decimal(0),
      averageOrderValue: paidOrderAgg._avg.total ?? new Prisma.Decimal(0),
      newCustomers,
    };
  }

  /** Aggregates order status breakdown and current store-wide inventory/catalog counts in parallel. */
  private async fetchStoreSnapshot(
    currentStart: Date,
    currentEnd: Date,
  ): Promise<IRawDashboardSnapshot> {
    const [
      orderStatusGroups,
      inventoryGroups,
      activeProductsCount,
      activeCustomersCount,
      pendingReviewsCount,
    ] = await Promise.all([
      this.db.order.groupBy({
        by: ['status'],
        where: {
          createdAt: { gte: currentStart, lte: currentEnd },
        },
        _count: { status: true },
      }),
      this.db.inventory.groupBy({
        by: ['stockStatus'],
        _count: { stockStatus: true },
      }),
      this.db.product.count({
        where: { isActive: true },
      }),
      this.db.user.count({
        where: {
          role: UserRole.CUSTOMER,
          isActive: true,
          deletedAt: null,
        },
      }),
      this.db.review.count({
        where: { status: ReviewStatus.PENDING },
      }),
    ]);

    const ordersByStatus: Record<OrderStatus, number> = {
      [OrderStatus.PENDING]: 0,
      [OrderStatus.CONFIRMED]: 0,
      [OrderStatus.PROCESSING]: 0,
      [OrderStatus.READY_FOR_PICKUP]: 0,
      [OrderStatus.READY_FOR_DELIVERY]: 0,
      [OrderStatus.DELIVERED]: 0,
      [OrderStatus.CANCELLED]: 0,
      [OrderStatus.REFUND_PENDING]: 0,
    };

    for (const row of orderStatusGroups) {
      ordersByStatus[row.status] = row._count.status;
    }

    const inventorySummary = {
      inStock: 0,
      lowStock: 0,
      outOfStock: 0,
    };

    for (const row of inventoryGroups) {
      if (row.stockStatus === StockStatus.IN_STOCK) {
        inventorySummary.inStock = row._count.stockStatus;
      } else if (row.stockStatus === StockStatus.LOW_STOCK) {
        inventorySummary.lowStock = row._count.stockStatus;
      } else if (row.stockStatus === StockStatus.OUT_OF_STOCK) {
        inventorySummary.outOfStock = row._count.stockStatus;
      }
    }

    return {
      ordersByStatus,
      inventorySummary,
      activeProductsCount,
      activeCustomersCount,
      pendingReviewsCount,
    };
  }

  /**
   * Executes current period metrics, previous period metrics, and store snapshot in parallel.
   */
  async fetchDashboardData(range: IPeriodRange) {
    try {
      const [currentMetrics, previousMetrics, snapshot] = await Promise.all([
        this.fetchPeriodMetrics(range.currentStart, range.currentEnd),
        this.fetchPeriodMetrics(range.previousStart, range.previousEnd),
        this.fetchStoreSnapshot(range.currentStart, range.currentEnd),
      ]);

      return { currentMetrics, previousMetrics, snapshot };
    } catch (error) {
      this.logger.error(
        `Failed to fetch dashboard metrics: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve dashboard analytics',
      );
    }
  }
}
