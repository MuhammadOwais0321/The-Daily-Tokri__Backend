import { Injectable } from '@nestjs/common';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Injectable()
export class DashboardService {
  getDashboard(query: DashboardQueryDto) {
    return { message: 'Dashboard metrics', period: query.period || 'today' };
  }

  exportDashboard(query: DashboardQueryDto) {
    return { message: 'Dashboard export CSV', period: query.period || 'today' };
  }
}
