import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AllergenPresence } from '../../../common/enums';

export class CreateProductAllergenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  allergen: string;

  @IsEnum(AllergenPresence)
  presence: AllergenPresence;
}
