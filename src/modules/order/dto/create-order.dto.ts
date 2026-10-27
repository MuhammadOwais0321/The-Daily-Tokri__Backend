import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DeliveryType } from '../../../common/enums';
import { OrderAddressDto } from './order-address.dto';

export class CreateOrderDto {
  @IsEnum(DeliveryType, {
    message: 'Delivery type must be either DELIVERY or PICKUP',
  })
  deliveryType: DeliveryType;

  @IsOptional()
  @IsUUID('4')
  addressId?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OrderAddressDto)
  shippingAddress?: OrderAddressDto;

  @IsOptional()
  @IsDateString()
  pickupScheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNotes?: string;
}
