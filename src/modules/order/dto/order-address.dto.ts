import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class OrderAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  addressLine: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  county: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postcode: string;
}
