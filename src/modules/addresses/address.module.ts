import { Module } from '@nestjs/common';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';
import { AddressDbService } from './address.db.service';

@Module({
  controllers: [AddressController],
  providers: [AddressService, AddressDbService],
  exports: [AddressService, AddressDbService],
})
export class AddressModule {}
