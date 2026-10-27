import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { AuthController } from './auth.controller';
import { AuditModule } from '../audit/audit.module';
import { UserModule } from '../user/user.module';
import { EmailService } from '../../common/services/email.service';
import { VerificationCleanupCron } from './cron/verification-cleanup.cron';

@Module({
  imports: [
    AuditModule,
    UserModule,
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ?? '1d') as
            `${number}${'s' | 'm' | 'h' | 'd'}` | number,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    EmailService,
    VerificationCleanupCron,
  ],
  exports: [AuthService, PasswordService, EmailService, JwtModule],
})
export class AuthModule {}
