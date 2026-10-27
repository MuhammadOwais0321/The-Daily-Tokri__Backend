import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/pagination';
import { StockStatus } from '../../../common/enums';

export class InventoryQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(StockStatus)
  stockStatus?: StockStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
