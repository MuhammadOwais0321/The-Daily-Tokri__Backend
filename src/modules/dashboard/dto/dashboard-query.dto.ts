import { IsIn, IsOptional } from 'class-validator';

export class DashboardQueryDto {
  @IsOptional()
  @IsIn(['today', 'yesterday', 'last_7', 'last_30', 'this_month', 'last_month'])
  period?:
    'today' | 'yesterday' | 'last_7' | 'last_30' | 'this_month' | 'last_month';
}
