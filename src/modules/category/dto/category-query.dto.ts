import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/pagination';

export class CategoryQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  bestCategory?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  isLeaf?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Depth must be an integer' })
  @Min(0, { message: 'Depth cannot be less than 0' })
  @Max(2, { message: 'Depth cannot exceed 2 (maximum 3 levels: 0, 1, 2)' })
  depth?: number;

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  tree?: boolean;

  @IsOptional()
  @IsIn(['name', 'createdAt', 'depth', 'updatedAt'])
  sortBy?: 'name' | 'createdAt' | 'depth' | 'updatedAt' = 'name';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';
}
