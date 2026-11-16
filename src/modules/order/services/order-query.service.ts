import { Injectable, NotFoundException } from '@nestjs/common';
import { buildMeta, PaginationMeta } from '../../../common/pagination';
import { ListOrdersQueryDto } from '../dto';
import { toOrderResponse } from '../mappers';
import { OrderDbService } from '../order.db.service';
import { IOrderResponse } from '../types';

@Injectable()
export class OrderQueryService {
  constructor(private readonly orderDb: OrderDbService) {}

  /** Retrieves paginated order history for the customer. */
  async findCustomerOrders(
    userId: string,
    query: ListOrdersQueryDto,
  ): Promise<{ data: IOrderResponse[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const { data, total } = await this.orderDb.findMany(query, userId);

    return {
      data: data.map(toOrderResponse),
      meta: buildMeta(total, page, limit),
    };
  }

  /** Retrieves single order detail scoped to `userId` (returns 404 if not owned). */
  async findCustomerOrderDetail(
    userId: string,
    orderId: string,
  ): Promise<IOrderResponse> {
    const order = await this.orderDb.findById(orderId, userId);
    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    return toOrderResponse(order);
  }

  /** Retrieves paginated orders for admin view with search and filters. */
  async findAdminOrders(
    query: ListOrdersQueryDto,
  ): Promise<{ data: IOrderResponse[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const { data, total } = await this.orderDb.findMany(query);

    return {
      data: data.map(toOrderResponse),
      meta: buildMeta(total, page, limit),
    };
  }

  /** Retrieves full order details by ID for admin view. */
  async findAdminOrderDetail(orderId: string): Promise<IOrderResponse> {
    const order = await this.orderDb.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    return toOrderResponse(order);
  }
}
