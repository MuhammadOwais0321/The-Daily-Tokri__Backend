import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@Injectable()
export class UserService {
  create(createUserDto: CreateUserDto) {
    return 'This action adds a new user';
  }

  findAll() {
    return `This action returns all user`;
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  updateProfile(updateUserProfileDto: UpdateUserProfileDto) {
    return `This action updates user profile`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
