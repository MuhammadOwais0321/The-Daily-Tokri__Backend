import { Prisma } from '@prisma/client';
import { DashboardPeriodService, IPeriodRange } from '../../../common/period';
import { toDecimalString } from '../../../common/utils/decimal';
import {
  IDashboardResponse,
  IKpiComparison,
  IRawDashboardSnapshot,
  IRawPeriodMetrics,
} from '../types';

function toNumberComparison(
  current: number,
  previous: number,
  periodService: DashboardPeriodService,
): IKpiComparison<number> {
  const { percentageChange, trend } = periodService.calculateComparison(
    current,
    previous,
  );
  return {
    current,
    previous,
    percentageChange,
    trend,
  };
}

function toMoneyComparison(
  current: Prisma.Decimal,
  previous: Prisma.Decimal,
  periodService: DashboardPeriodService,
): IKpiComparison<string> {
  const { percentageChange, trend } = periodService.calculateComparison(
    current.toNumber(),
    previous.toNumber(),
  );
  return {
    current: toDecimalString(current),
    previous: toDecimalString(previous),
    percentageChange,
    trend,
  };
}

export function toDashboardResponse(
  range: IPeriodRange,
  currentMetrics: IRawPeriodMetrics,
  previousMetrics: IRawPeriodMetrics,
  snapshot: IRawDashboardSnapshot,
  periodService: DashboardPeriodService,
): IDashboardResponse {
  return {
    period: range.period,
    dateRange: {
      currentStart: range.currentStart.toISOString(),
      currentEnd: range.currentEnd.toISOString(),
      previousStart: range.previousStart.toISOString(),
      previousEnd: range.previousEnd.toISOString(),
    },
    kpis: {
      revenue: toMoneyComparison(
        currentMetrics.revenue,
        previousMetrics.revenue,
        periodService,
      ),
      totalOrders: toNumberComparison(
        currentMetrics.totalOrders,
        previousMetrics.totalOrders,
        periodService,
      ),
      paidOrders: toNumberComparison(
        currentMetrics.paidOrders,
        previousMetrics.paidOrders,
        periodService,
      ),
      averageOrderValue: toMoneyComparison(
        currentMetrics.averageOrderValue,
        previousMetrics.averageOrderValue,
        periodService,
      ),
      newCustomers: toNumberComparison(
        currentMetrics.newCustomers,
        previousMetrics.newCustomers,
        periodService,
      ),
    },
    ordersByStatus: snapshot.ordersByStatus,
    inventorySummary: snapshot.inventorySummary,
    storeSummary: {
      activeProducts: snapshot.activeProductsCount,
      activeCustomers: snapshot.activeCustomersCount,
      pendingReviews: snapshot.pendingReviewsCount,
    },
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toDashboardCsv(dashboard: IDashboardResponse): string {
  const rows: Array<Array<string | number>> = [
    ['Section', 'Metric', 'Current', 'Previous', 'Change (%)', 'Trend'],
    [
      'Period',
      dashboard.period,
      `${dashboard.dateRange.currentStart} to ${dashboard.dateRange.currentEnd}`,
      `${dashboard.dateRange.previousStart} to ${dashboard.dateRange.previousEnd}`,
      '',
      '',
    ],
    [
      'KPI',
      'Revenue (GBP)',
      dashboard.kpis.revenue.current,
      dashboard.kpis.revenue.previous,
      dashboard.kpis.revenue.percentageChange,
      dashboard.kpis.revenue.trend,
    ],
    [
      'KPI',
      'Total Orders',
      dashboard.kpis.totalOrders.current,
      dashboard.kpis.totalOrders.previous,
      dashboard.kpis.totalOrders.percentageChange,
      dashboard.kpis.totalOrders.trend,
    ],
    [
      'KPI',
      'Paid Orders',
      dashboard.kpis.paidOrders.current,
      dashboard.kpis.paidOrders.previous,
      dashboard.kpis.paidOrders.percentageChange,
      dashboard.kpis.paidOrders.trend,
    ],
    [
      'KPI',
      'Average Order Value (GBP)',
      dashboard.kpis.averageOrderValue.current,
      dashboard.kpis.averageOrderValue.previous,
      dashboard.kpis.averageOrderValue.percentageChange,
      dashboard.kpis.averageOrderValue.trend,
    ],
    [
      'KPI',
      'New Customers',
      dashboard.kpis.newCustomers.current,
      dashboard.kpis.newCustomers.previous,
      dashboard.kpis.newCustomers.percentageChange,
      dashboard.kpis.newCustomers.trend,
    ],
    ...Object.entries(dashboard.ordersByStatus).map(([status, count]) => [
      'Order Status',
      status,
      count,
      '',
      '',
      '',
    ]),
    ['Inventory', 'IN_STOCK', dashboard.inventorySummary.inStock, '', '', ''],
    ['Inventory', 'LOW_STOCK', dashboard.inventorySummary.lowStock, '', '', ''],
    [
      'Inventory',
      'OUT_OF_STOCK',
      dashboard.inventorySummary.outOfStock,
      '',
      '',
      '',
    ],
    [
      'Store Summary',
      'Active Products',
      dashboard.storeSummary.activeProducts,
      '',
      '',
      '',
    ],
    [
      'Store Summary',
      'Active Customers',
      dashboard.storeSummary.activeCustomers,
      '',
      '',
      '',
    ],
    [
      'Store Summary',
      'Pending Reviews',
      dashboard.storeSummary.pendingReviews,
      '',
      '',
      '',
    ],
  ];

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}
