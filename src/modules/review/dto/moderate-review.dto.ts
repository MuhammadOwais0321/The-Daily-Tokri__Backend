import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReviewStatus } from '@prisma/client';

export class ModerateReviewDto {
  @IsIn([ReviewStatus.APPROVED, ReviewStatus.REJECTED], {
    message: 'Moderation status must be APPROVED or REJECTED',
  })
  @IsNotEmpty()
  status: ReviewStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500, { message: 'Admin reply cannot exceed 500 characters' })
  adminReply?: string;
}
