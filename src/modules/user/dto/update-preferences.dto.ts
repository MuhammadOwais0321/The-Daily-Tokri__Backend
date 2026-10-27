import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateUserPreferencesDto {
  @IsOptional()
  @IsBoolean()
  pushNotification?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNotification?: boolean;
}
