import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateInventoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Low stock threshold cannot be negative' })
  lowStockThreshold?: number;

  @IsOptional()
  @IsUUID('4')
  batchId?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
