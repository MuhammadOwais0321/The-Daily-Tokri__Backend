import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateNotificationDto {
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Title cannot exceed 100 characters' })
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500, { message: 'Message cannot exceed 500 characters' })
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Reference ID cannot exceed 100 characters' })
  referenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Reference event cannot exceed 50 characters' })
  referenceEvent?: string;
}
