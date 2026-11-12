import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/types';
import {
  CancelOrderDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  UpdateOrderStatusDto,
} from './dto';
import {
  OrderCancellationService,
  OrderCreationService,
  OrderQueryService,
  OrderStatusService,
} from './services';

@Injectable()
export class OrderService {
  constructor(
    private readonly creationService: OrderCreationService,
    private readonly cancellationService: OrderCancellationService,
    private readonly statusService: OrderStatusService,
    private readonly queryService: OrderQueryService,
  ) {}

  create(user: AuthUser, dto: CreateOrderDto) {
    return this.creationService.createOrder(user, dto);
  }

  findCustomerOrders(userId: string, query: ListOrdersQueryDto) {
    return this.queryService.findCustomerOrders(userId, query);
  }

  findCustomerOrderDetail(userId: string, orderId: string) {
    return this.queryService.findCustomerOrderDetail(userId, orderId);
  }

  cancelCustomerOrder(orderId: string, user: AuthUser, dto: CancelOrderDto) {
    return this.cancellationService.cancelCustomerOrder(orderId, user, dto);
  }

  findAdminOrders(query: ListOrdersQueryDto) {
    return this.queryService.findAdminOrders(query);
  }

  findAdminOrderDetail(orderId: string) {
    return this.queryService.findAdminOrderDetail(orderId);
  }

  updateStatus(orderId: string, admin: AuthUser, dto: UpdateOrderStatusDto) {
    return this.statusService.updateStatus(orderId, admin, dto);
  }

  cancelAdminOrder(orderId: string, admin: AuthUser, dto: CancelOrderDto) {
    return this.cancellationService.cancelAdminOrder(orderId, admin, dto);
  }
}
