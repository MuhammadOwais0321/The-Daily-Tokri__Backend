import { Module } from '@nestjs/common';
import { DashboardPeriodService } from '../../common/period';
import { DatabaseModule } from '../../database';
import { DashboardController } from './dashboard.controller';
import { DashboardDbService } from './dashboard.db.service';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardDbService, DashboardPeriodService],
  exports: [DashboardService, DashboardDbService, DashboardPeriodService],
})
export class DashboardModule {}
