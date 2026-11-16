import { Injectable } from '@nestjs/common';

export const DASHBOARD_PERIODS = [
  'today',
  'yesterday',
  'last_7',
  'last_30',
  'this_month',
  'last_month',
] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export type ComparisonTrend = 'up' | 'down' | 'neutral';

export interface IPeriodRange {
  period: DashboardPeriod;
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
}

@Injectable()
export class DashboardPeriodService {
  /**
   * Computes UTC start/end timestamps for the requested period and its
   * matching previous comparison period (Docs 01 §22.5, 02 §2.1, 13 §Advanced).
   */
  resolvePeriodRange(
    period: DashboardPeriod = 'today',
    referenceDate: Date = new Date(),
  ): IPeriodRange {
    const year = referenceDate.getUTCFullYear();
    const month = referenceDate.getUTCMonth();
    const day = referenceDate.getUTCDate();

    const startOfUtcDay = (y: number, m: number, d: number): Date =>
      new Date(Date.UTC(y, m, d, 0, 0, 0, 0));

    const endOfUtcDay = (y: number, m: number, d: number): Date =>
      new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

    switch (period) {
      case 'yesterday':
        return {
          period,
          currentStart: startOfUtcDay(year, month, day - 1),
          currentEnd: endOfUtcDay(year, month, day - 1),
          previousStart: startOfUtcDay(year, month, day - 2),
          previousEnd: endOfUtcDay(year, month, day - 2),
        };

      case 'last_7':
        return {
          period,
          currentStart: startOfUtcDay(year, month, day - 6),
          currentEnd: endOfUtcDay(year, month, day),
          previousStart: startOfUtcDay(year, month, day - 13),
          previousEnd: endOfUtcDay(year, month, day - 7),
        };

      case 'last_30':
        return {
          period,
          currentStart: startOfUtcDay(year, month, day - 29),
          currentEnd: endOfUtcDay(year, month, day),
          previousStart: startOfUtcDay(year, month, day - 59),
          previousEnd: endOfUtcDay(year, month, day - 30),
        };

      case 'this_month':
        return {
          period,
          currentStart: startOfUtcDay(year, month, 1),
          currentEnd: endOfUtcDay(year, month + 1, 0),
          previousStart: startOfUtcDay(year, month - 1, 1),
          previousEnd: endOfUtcDay(year, month, 0),
        };

      case 'last_month':
        return {
          period,
          currentStart: startOfUtcDay(year, month - 1, 1),
          currentEnd: endOfUtcDay(year, month, 0),
          previousStart: startOfUtcDay(year, month - 2, 1),
          previousEnd: endOfUtcDay(year, month - 1, 0),
        };

      case 'today':
      default:
        return {
          period: 'today',
          currentStart: startOfUtcDay(year, month, day),
          currentEnd: endOfUtcDay(year, month, day),
          previousStart: startOfUtcDay(year, month, day - 1),
          previousEnd: endOfUtcDay(year, month, day - 1),
        };
    }
  }

  /**
   * Computes percentage change and trend direction safely without division-by-zero errors.
   */
  calculateComparison(
    current: number,
    previous: number,
  ): { percentageChange: number; trend: ComparisonTrend } {
    if (previous === 0) {
      if (current === 0) {
        return { percentageChange: 0, trend: 'neutral' };
      }
      return {
        percentageChange: current > 0 ? 100 : -100,
        trend: current > 0 ? 'up' : 'down',
      };
    }

    const rawChange = ((current - previous) / previous) * 100;
    const percentageChange = Number(rawChange.toFixed(2));
    const trend: ComparisonTrend =
      current > previous ? 'up' : current < previous ? 'down' : 'neutral';

    return { percentageChange, trend };
  }
}
