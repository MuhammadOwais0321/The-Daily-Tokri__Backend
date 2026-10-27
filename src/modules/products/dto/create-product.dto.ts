import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StorageType, UnitOfMeasure } from '../../../common/enums';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsUUID('4')
  @IsNotEmpty()
  categoryId: string;

  @IsOptional()
  @IsUUID('4')
  brandId?: string;

  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  barcode?: string;

  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Price must be a valid number with at most 2 decimal places' },
  )
  @Min(0.01, { message: 'Price must be at least 0.01' })
  @Max(99999999.99, {
    message:
      'Price cannot exceed 99,999,999.99 (max 8 integer digits and 2 decimal places)',
  })
  price: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  minimumOrderQuantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maximumOrderQuantity: number;

  @IsOptional()
  @IsEnum(StorageType)
  storageType?: StorageType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shelfLifeDays?: number;

  @IsOptional()
  @IsEnum(UnitOfMeasure)
  unitOfMeasure?: UnitOfMeasure;

  @IsOptional()
  @IsBoolean()
  batchTracked?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
