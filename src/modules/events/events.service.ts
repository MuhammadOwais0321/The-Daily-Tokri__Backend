import { Injectable } from '@nestjs/common';

@Injectable()
export class EventsService {
  findAll() {
    return `This action returns all events`;
  }

  findOne(id: number) {
    return `This action returns a #${id} event`;
  }

  remove(id: number) {
    return `This action removes a #${id} event`;
  }
}
