import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OrderCancellationReason } from '../../../common/enums';

export class CancelOrderDto {
  @IsEnum(OrderCancellationReason)
  @IsNotEmpty()
  reason: OrderCancellationReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
