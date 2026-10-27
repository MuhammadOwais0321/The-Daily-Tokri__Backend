import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { AdjustmentReason } from '../../../common/enums';

export class InventoryAdjustmentDto {
  @IsUUID('4')
  @IsNotEmpty()
  inventoryId: string;

  @IsOptional()
  @IsUUID('4')
  batchId?: string;

  @Type(() => Number)
  @IsInt()
  @NotEquals(0, { message: 'Quantity cannot be zero' })
  quantity: number;

  @IsEnum(AdjustmentReason)
  @IsNotEmpty()
  reason: AdjustmentReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
