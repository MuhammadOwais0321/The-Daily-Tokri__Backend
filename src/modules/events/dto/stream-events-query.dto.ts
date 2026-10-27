import { IsOptional, IsString } from 'class-validator';

export class StreamEventsQueryDto {
  @IsOptional()
  @IsString()
  lastEventId?: string;
}
