import { Injectable } from '@nestjs/common';
import { DashboardPeriodService } from '../../common/period';
import { DashboardDbService } from './dashboard.db.service';
import { DashboardQueryDto } from './dto';
import { toDashboardCsv, toDashboardResponse } from './mappers';
import { IDashboardResponse } from './types';

@Injectable()
export class DashboardService {
  constructor(
    private readonly dashboardDb: DashboardDbService,
    private readonly periodService: DashboardPeriodService,
  ) {}

  /** Computes dashboard KPIs, period comparisons, and store breakdowns. */
  async getDashboard(query: DashboardQueryDto): Promise<IDashboardResponse> {
    const range = this.periodService.resolvePeriodRange(
      query.period ?? 'today',
    );
    const { currentMetrics, previousMetrics, snapshot } =
      await this.dashboardDb.fetchDashboardData(range);

    return toDashboardResponse(
      range,
      currentMetrics,
      previousMetrics,
      snapshot,
      this.periodService,
    );
  }

  /** Exports dashboard KPIs and breakdowns as CSV for the requested period. */
  async exportDashboard(
    query: DashboardQueryDto,
  ): Promise<{ filename: string; csv: string }> {
    const dashboard = await this.getDashboard(query);
    const csv = toDashboardCsv(dashboard);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `dashboard-${dashboard.period}-${dateStamp}.csv`;

    return { filename, csv };
  }
}
