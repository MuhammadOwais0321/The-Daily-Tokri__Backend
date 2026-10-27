import { IsDateString, IsOptional } from 'class-validator';

export class UpdateBatchDto {
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
