import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';

export class AddToCartDto {
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;
}
