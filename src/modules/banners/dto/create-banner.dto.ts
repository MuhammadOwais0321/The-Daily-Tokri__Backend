import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

function trimNullableText(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseOptionalBoolean(value: unknown): unknown {
  if (
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return undefined;
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function parseOptionalInt(value: unknown): unknown {
  if (
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return undefined;
  }
  if (typeof value === 'string') return Number(value);
  return value;
}

export class CreateBannerDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimNullableText(value))
  @IsString({ message: 'title must be a string' })
  @MaxLength(120, { message: 'title must not exceed 120 characters' })
  title?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimNullableText(value))
  @IsString({ message: 'subtitle must be a string' })
  @MaxLength(255, { message: 'subtitle must not exceed 255 characters' })
  subtitle?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimNullableText(value))
  @IsString({ message: 'linkUrl must be a string' })
  @MaxLength(500, { message: 'linkUrl must not exceed 500 characters' })
  @Matches(/^(https?:\/\/.+|\/(?!\/).*)$/i, {
    message:
      'linkUrl must be a valid relative path (starting with /) or http(s) URL',
  })
  linkUrl?: string | null;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => parseOptionalInt(value))
  @IsInt({ message: 'sortOrder must be an integer' })
  @Min(0, { message: 'sortOrder must be at least 0' })
  @Max(100, { message: 'sortOrder must not exceed 100' })
  sortOrder?: number;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => parseOptionalBoolean(value))
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
