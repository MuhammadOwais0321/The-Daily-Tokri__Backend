import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import {
  DASHBOARD_PERIODS,
  type DashboardPeriod,
} from '../../../common/period';

export class DashboardQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(DASHBOARD_PERIODS, {
    message: `period must be one of: ${DASHBOARD_PERIODS.join(', ')}`,
  })
  period?: DashboardPeriod;
}
