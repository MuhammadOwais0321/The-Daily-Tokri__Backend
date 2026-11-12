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

  /** List active products without inventory */
  @Get('available-products')
  findAvailableProducts(@Query() query: PaginationDto) {
    return this.inventoryService.findAvailableProducts(query);
  }

  /** Global inventory transaction ledger */
  @Get('transactions')
  findTransactions(@Query() query: InventoryTransactionsQueryDto) {
    return this.inventoryService.findTransactions(query);
  }

  /** List inventory records */
  @Get()
  findAll(@Query() query: InventoryQueryDto) {
    return this.inventoryService.findAll(query);
  }

  /** Transactions for specific inventory */
  @Get(':id/transactions')
  findInventoryTransactions(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: PaginationDto,
  ) {
    return this.inventoryService.findTransactionsByInventoryId(id, query);
  }

  /** Inventory detail */
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.inventoryService.findOne(id);
  }

  /** Create inventory record */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateInventoryDto, @CurrentUser('id') adminId: string) {
    return this.inventoryService.create(dto, adminId);
  }

  /** Adjust stock quantity */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  adjust(
    @Body() dto: InventoryAdjustmentDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.inventoryService.adjust(dto, adminId);
  }

  /** Update inventory threshold or batch expiry */
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
