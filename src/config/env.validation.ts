import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
  MinLength,
} from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty({ message: 'JWT_SECRET is required and cannot be empty' })
  @MinLength(16, { message: 'JWT_SECRET must be at least 16 characters long' })
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  @IsString()
  @IsNotEmpty({ message: 'JWT_REFRESH_SECRET is required and cannot be empty' })
  @MinLength(16, {
    message: 'JWT_REFRESH_SECRET must be at least 16 characters long',
  })
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN?: string;

  @IsString()
  @IsOptional()
  URL_PREFIX?: string;

  @IsNumber()
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsString()
  @IsOptional()
  ADMIN_EMAIL?: string;

  @IsString()
  @IsOptional()
  ADMIN_PASSWORD?: string;

  @IsString()
  @IsOptional()
  ADMIN_NAME?: string;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((err) => Object.values(err.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  return validatedConfig;
}
