import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { PaymentMethod, PaymentProvider } from '../../../common/enums';

export class InitiatePaymentDto {
  @IsUUID('4')
  @IsNotEmpty({ message: 'Order ID is required' })
  orderId: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;
}
