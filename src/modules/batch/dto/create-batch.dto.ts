import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBatchDto {
  @IsUUID('4')
  @IsNotEmpty()
  inventoryId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Batch quantity must be at least 1' })
  qtyOnHand: number;

  @IsDateString()
  @IsNotEmpty({ message: 'Expiry date is required' })
  expiryDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
