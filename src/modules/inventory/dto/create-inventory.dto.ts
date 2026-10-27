import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateInventoryBatchDto {
  @IsDateString()
  @IsNotEmpty({ message: 'Expiry date is required for batch' })
  expiryDate: string;
}

export class CreateInventoryDto {
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Quantity on hand cannot be negative' })
  qtyOnHand: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Low stock threshold cannot be negative' })
  lowStockThreshold?: number = 10;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateInventoryBatchDto)
  batch?: CreateInventoryBatchDto;
}
