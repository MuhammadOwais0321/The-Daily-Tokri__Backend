import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  @IsNotEmpty({ message: 'Email is required' })
  @MaxLength(255)
  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  email: string;
}
