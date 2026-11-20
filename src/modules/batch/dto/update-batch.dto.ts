import { IsDateString, IsNotEmpty } from 'class-validator';

export class UpdateBatchDto {
  @IsDateString()
  @IsNotEmpty({ message: 'Expiry date is required' })
  expiryDate: string;
}
