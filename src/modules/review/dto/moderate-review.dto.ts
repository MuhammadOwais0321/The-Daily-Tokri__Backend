import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReviewStatus } from '../../../common/enums';

export class ModerateReviewDto {
  @IsEnum(ReviewStatus)
  @IsNotEmpty()
  status: ReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminReply?: string;
}
