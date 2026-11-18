import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateThemeDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'activeTheme must be a string' })
  @IsNotEmpty({ message: 'activeTheme is required' })
  @MaxLength(50, { message: 'activeTheme must not exceed 50 characters' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      'activeTheme may only contain letters, numbers, hyphens, and underscores',
  })
  activeTheme: string;
}
