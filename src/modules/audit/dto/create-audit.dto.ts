import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AuditActorType } from '../../../common/enums';

export class CreateAuditDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  entityType: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  action: string;

  @IsOptional()
  @IsEnum(AuditActorType)
  actorType?: AuditActorType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  actorId?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
