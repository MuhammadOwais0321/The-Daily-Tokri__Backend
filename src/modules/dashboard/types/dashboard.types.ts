import { OrderStatus, Prisma } from '@prisma/client';
import { ComparisonTrend, DashboardPeriod } from '../../../common/period';

export interface IRawPeriodMetrics {
  totalOrders: number;
  paidOrders: number;
  revenue: Prisma.Decimal;
  averageOrderValue: Prisma.Decimal;
  newCustomers: number;
}

export interface IRawDashboardSnapshot {
  ordersByStatus: Record<OrderStatus, number>;
  inventorySummary: {
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
  activeProductsCount: number;
  activeCustomersCount: number;
  pendingReviewsCount: number;
}

export interface IKpiComparison<T extends number | string> {
  current: T;
  previous: T;
  percentageChange: number;
  trend: ComparisonTrend;
}

export interface IDashboardKpis {
  revenue: IKpiComparison<string>;
  totalOrders: IKpiComparison<number>;
  paidOrders: IKpiComparison<number>;
  averageOrderValue: IKpiComparison<string>;
  newCustomers: IKpiComparison<number>;
}

export interface IDashboardResponse {
  period: DashboardPeriod;
  dateRange: {
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
  };
  kpis: IDashboardKpis;
  ordersByStatus: Record<OrderStatus, number>;
  inventorySummary: {
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
  storeSummary: {
    activeProducts: number;
    activeCustomers: number;
    pendingReviews: number;
  };
}
