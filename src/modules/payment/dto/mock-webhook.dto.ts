import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class MockWebhookDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  gatewayRef: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  failureReason?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountPence?: number;
}
