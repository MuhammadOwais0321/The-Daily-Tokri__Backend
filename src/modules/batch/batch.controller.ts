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
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import { BatchService } from './batch.service';
import { BatchQueryDto, CreateBatchDto, UpdateBatchDto } from './dto';

@Roles(UserRole.ADMIN)
@Controller('admin/batches')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  /** Create a new batch for an existing batch-tracked inventory record */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBatchDto, @CurrentUser('id') adminId: string) {
    return this.batchService.create(dto, adminId);
  }

  /** List batches with product, inventory, category, status, and expiry filters */
  @Get()
  findAll(@Query() query: BatchQueryDto) {
    return this.batchService.findAll(query);
  }

  /** Batch detail by UUID */
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.batchService.findOne(id);
  }

  /** Update batch expiry date */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateBatchDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.batchService.update(id, dto, adminId);
  }
}
