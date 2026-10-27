import { IsEnum, IsNotEmpty } from 'class-validator';
import { OrderStatus } from '../../../common/enums';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  @IsNotEmpty()
  status: OrderStatus;
}
