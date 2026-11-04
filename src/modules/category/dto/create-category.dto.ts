import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCategoryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Category name is required' })
  @MaxLength(100, { message: 'Category name must not exceed 100 characters' })
  name: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500, {
    message: 'Category description must not exceed 500 characters',
  })
  description?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Parent ID must be a valid UUID v4' })
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  bestCategory?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
