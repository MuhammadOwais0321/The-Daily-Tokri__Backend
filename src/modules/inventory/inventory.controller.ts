import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InventoryService } from './inventory.service';
import {
  CreateInventoryDto,
  InventoryAdjustmentDto,
  InventoryQueryDto,
  InventoryTransactionsQueryDto,
  UpdateInventoryDto,
} from './dto';
import { Roles, CurrentUser } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import { PaginationDto } from '../../common/pagination';

@Roles(UserRole.ADMIN)
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * Static route: List active products that do not have an inventory record yet.
   * Placed before :id to prevent route shadowing.
   */
  @Get('available-products')
  findAvailableProducts(@Query() query: PaginationDto) {
    return this.inventoryService.findAvailableProducts(query);
  }

  /**
   * Static route: Query inventory transaction ledger across all products.
   * Placed before :id to prevent route shadowing.
   */
  @Get('transactions')
  findTransactions(@Query() query: InventoryTransactionsQueryDto) {
    return this.inventoryService.findTransactions(query);
  }

  /**
   * List inventory records with pagination, stockStatus filter, and search.
   */
  @Get()
  findAll(@Query() query: InventoryQueryDto) {
    return this.inventoryService.findAll(query);
  }

  /**
   * Sub-resource route for transactions of a specific inventory.
   * Placed before :id to prevent collision.
   */
  @Get(':id/transactions')
  findInventoryTransactions(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: PaginationDto,
  ) {
    return this.inventoryService.findTransactionsByInventoryId(id, query);
  }

  /**
   * Inventory detail by UUID.
   */
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.inventoryService.findOne(id);
  }

  /**
   * Create inventory for a product.
   */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateInventoryDto, @CurrentUser('id') adminId: string) {
    return this.inventoryService.create(dto, adminId);
  }

  /**
   * Adjust stock quantity (increase / decrease) with reason and ledger tracking.
   */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  adjust(
    @Body() dto: InventoryAdjustmentDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.inventoryService.adjust(dto, adminId);
  }

  /**
   * Update inventory lowStockThreshold or batch expiry.
   */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateInventoryDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.inventoryService.update(id, dto, adminId);
  }
}
