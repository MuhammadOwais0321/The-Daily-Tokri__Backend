import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBrandDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Brand name is required' })
  @MaxLength(100, { message: 'Brand name must not exceed 100 characters' })
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
