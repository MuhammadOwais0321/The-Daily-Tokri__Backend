import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AllergenPresence } from '../../../common/enums';

export class CreateProductAllergenDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  allergen: string;

  @IsEnum(AllergenPresence)
  presence: AllergenPresence;
}
