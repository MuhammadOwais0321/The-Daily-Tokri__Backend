import { IsNotEmpty, IsUUID } from 'class-validator';

export class InitiatePaymentDto {
  @IsUUID('4')
  @IsNotEmpty({ message: 'Order ID is required' })
  orderId: string;
}
