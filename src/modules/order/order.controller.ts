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
import type { AuthUser } from '../auth/types';
import { CancelOrderDto, CreateOrderDto, ListOrdersQueryDto } from './dto';
import { OrderService } from './order.service';

@Throttle(RATE_LIMITS.ORDER)
@Roles(UserRole.CUSTOMER)
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /** Places a new order from items in the customer's cart. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orderService.create(user, dto);
  }

  /** Lists the customer's own orders with pagination and filters. */
  @Get('me')
  findMyOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.orderService.findCustomerOrders(user.id, query);
  }

  /** Retrieves details of the customer's own order by ID. */
  @Get('me/:id')
  findMyOrderDetail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.orderService.findCustomerOrderDetail(user.id, id);
  }

  /** Cancels the customer's own order (allowed when `PENDING` or `CONFIRMED`). */
  @Patch('me/:id/cancel')
  cancelMyOrder(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderService.cancelCustomerOrder(id, user, dto);
  }
}
