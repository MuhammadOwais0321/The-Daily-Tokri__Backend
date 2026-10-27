import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class MockCompletePaymentDto {
  @IsIn(['succeeded', 'failed'], {
    message: 'Outcome must be either succeeded or failed',
  })
  @IsNotEmpty()
  outcome: 'succeeded' | 'failed';

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Failure reason cannot exceed 255 characters' })
  failureReason?: string;
}
