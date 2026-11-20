import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { BatchStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/pagination';

export class BatchQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID('4')
  inventoryId?: string;

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

  @IsOptional()
  @IsString()
  search?: string;
}
