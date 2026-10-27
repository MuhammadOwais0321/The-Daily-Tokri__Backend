import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/pagination';
import { BatchStatus } from '../../../common/enums';

export class BatchQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;

  @IsOptional()
  @IsDateString()
  expiryFrom?: string;

  @IsOptional()
  @IsDateString()
  expiryTo?: string;
}
