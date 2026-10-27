import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserDbService } from './user.db.service';

@Module({
  controllers: [UserController],
  providers: [UserService, UserDbService],
  exports: [UserService, UserDbService],
})
export class UserModule {}
