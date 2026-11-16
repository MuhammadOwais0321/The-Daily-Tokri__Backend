import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { AuditModule } from '../audit/audit.module';
import { UserController } from './user.controller';
import { UserDbService } from './user.db.service';
import { UserService } from './user.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [UserController],
  providers: [UserService, UserDbService],
  exports: [UserService, UserDbService],
})
export class UserModule {}
