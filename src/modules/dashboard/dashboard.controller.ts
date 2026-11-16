import { Controller, Get, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto';

@SkipThrottle()
@Roles(UserRole.ADMIN)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Admin: Export dashboard KPIs and breakdowns as CSV.
   * Placed before root route for clarity.
   * GET /admin/dashboard/export
   */
  @Get('export')
  async exportDashboard(
    @Query() query: DashboardQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, csv } =
      await this.dashboardService.exportDashboard(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  /**
   * Admin: Get dashboard KPIs, period comparisons, and store breakdowns.
   * GET /admin/dashboard
   */
  @Get()
  getDashboard(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getDashboard(query);
  }
}
