import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import type { AuthUser } from '../auth/types';
import {
  CancelOrderDto,
  ListOrdersQueryDto,
  UpdateOrderStatusDto,
} from './dto';
import { OrderService } from './order.service';

@Throttle(RATE_LIMITS.ORDER)
@Roles(UserRole.ADMIN)
@Controller('admin/orders')
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  /** Lists all store orders with filters and pagination. */
  @Get()
  findAll(@Query() query: ListOrdersQueryDto) {
    return this.orderService.findAdminOrders(query);
  }

  /** Retrieves full order details by ID. */
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.orderService.findAdminOrderDetail(id);
  }

  /** Advances an order's fulfillment status. */
  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() admin: AuthUser,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateStatus(id, admin, dto);
  }

  /** Cancels an order at any pre-delivery stage. */
  @Patch(':id/cancel')
  cancelOrder(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() admin: AuthUser,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderService.cancelAdminOrder(id, admin, dto);
  }
}
