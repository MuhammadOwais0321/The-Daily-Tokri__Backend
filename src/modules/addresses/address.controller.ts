import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AddressService } from './address.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { RATE_LIMITS } from '../../config/rate-limit.config';

@Throttle(RATE_LIMITS.USER)
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
@Controller('addresses')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  /** Create new address */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateAddressDto) {
    return this.addressService.create(userId, dto);
  }

  /** List all addresses for authenticated user (default first) */
  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.addressService.findAll(userId);
  }

  /** Set address as default */
  @Patch(':id/default')
  setDefault(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.addressService.setDefault(id, userId);
  }

  /** Get address detail by UUID */
  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.addressService.findOne(id, userId);
  }

  /** Update address fields (partial) */
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressService.update(id, userId, dto);
  }

  /** Delete address */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.addressService.delete(id, userId);
  }
}
