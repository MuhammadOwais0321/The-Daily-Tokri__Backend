import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100, { message: 'Category name must not exceed 100 characters' })
  name?: string;

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
  @ValidateIf((_, val) => val !== null && val !== undefined)
  @IsUUID('4', { message: 'Parent ID must be a valid UUID v4 or null' })
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  bestCategory?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
