import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/pagination';
import { ReviewStatus } from '../../../common/enums';

export class ReviewQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsIn(['newest', 'highest', 'lowest'])
  sortBy?: 'newest' | 'highest' | 'lowest';
}
