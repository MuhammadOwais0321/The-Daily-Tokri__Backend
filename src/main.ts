import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ErrorsExceptionFilter } from './filters/errors.exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const isProd = configService.get<string>('NODE_ENV') === 'production';

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.use(cookieParser());

  app.use(
    helmet({
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'no-referrer' },
      hsts: isProd
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
      contentSecurityPolicy: isProd ? undefined : false,
    }),
  );

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new ErrorsExceptionFilter());

  const port = configService.get<number>('PORT') ?? 4000;
  await app.listen(port);
}
void bootstrap();
