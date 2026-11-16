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

  /**
   * Admin: List all suppliers with pagination and filters.
   * GET /admin/suppliers
   */
  @SkipThrottle()
  @Get()
  findAll(@Query() query: SupplierQueryDto) {
    return this.supplierService.findAll(query);
  }

  /**
   * Admin: Get supplier detail by UUID.
   * GET /admin/suppliers/:id
   */
  @SkipThrottle()
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.supplierService.findOne(id);
  }

  /**
   * Admin: Create a new supplier.
   * POST /admin/suppliers
   */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createSupplierDto: CreateSupplierDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.supplierService.create(createSupplierDto, adminId);
  }

  /**
   * Admin: Update supplier details.
   * PATCH /admin/suppliers/:id
   */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.supplierService.update(id, updateSupplierDto, adminId);
  }

  /**
   * Admin: Delete supplier (blocked with 409 if products are linked).
   * DELETE /admin/suppliers/:id
   */
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
