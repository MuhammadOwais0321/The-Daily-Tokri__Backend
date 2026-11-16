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
  Query,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import { CreateSupplierDto, SupplierQueryDto, UpdateSupplierDto } from './dto';
import { SupplierService } from './supplier.service';

@Roles(UserRole.ADMIN)
@Controller('admin/suppliers')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  /** List all suppliers with pagination and filters. */
  @SkipThrottle()
  @Get()
  findAll(@Query() query: SupplierQueryDto) {
    return this.supplierService.findAll(query);
  }

  /** Get supplier detail by UUID. */
  @SkipThrottle()
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.supplierService.findOne(id);
  }

  /** Create a new supplier. */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createSupplierDto: CreateSupplierDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.supplierService.create(createSupplierDto, adminId);
  }

  /** Update supplier details. */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.supplierService.update(id, updateSupplierDto, adminId);
  }

  /** Delete supplier (blocked with 409 if products are linked). */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.supplierService.remove(id, adminId);
  }
}
