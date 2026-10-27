import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AddressLabel } from '../../../common/enums';

export class CreateAddressDto {
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

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  buildingType?: string;

  @IsOptional()
  @IsEnum(AddressLabel)
  label?: AddressLabel;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
