import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';

export class CreateBatchDto {
  @IsUUID('4')
  @IsNotEmpty()
  inventoryId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qtyOnHand: number;

  @IsDateString()
  @IsNotEmpty()
  expiryDate: string;
}
