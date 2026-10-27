import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminReplyReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Admin reply cannot exceed 500 characters' })
  adminReply?: string;
}
