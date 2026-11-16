import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuditActorType } from '@prisma/client';
import { PaginationDto } from '../../../common/pagination';

export class AuditQueryDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(50)
  entityType?: string;

  @IsOptional()
  @IsEnum(AuditActorType)
  actorType?: AuditActorType;
}
