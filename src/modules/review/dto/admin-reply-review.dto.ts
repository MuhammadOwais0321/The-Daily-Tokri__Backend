import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminReplyReviewDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Admin reply is required' })
  @MaxLength(500, { message: 'Admin reply cannot exceed 500 characters' })
  adminReply: string;
}
