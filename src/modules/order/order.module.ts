import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { AddressModule } from '../addresses/address.module';
import { AuditModule } from '../audit/audit.module';
import { CartModule } from '../cart/cart.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationModule } from '../notification/notification.module';
import { PaymentModule } from '../payment/payment.module';
import { AdminOrderController } from './admin-order.controller';
import { OrderPaymentTimeoutCron } from './cron';
import { OrderController } from './order.controller';
import { OrderDbService } from './order.db.service';
import { OrderService } from './order.service';
import {
  OrderCancellationService,
  OrderCreationService,
  OrderQueryService,
  OrderStatusService,
} from './services';

@Module({
  imports: [
    DatabaseModule,
    AddressModule,
    CartModule,
    InventoryModule,
    AuditModule,
    NotificationModule,
    PaymentModule, // exports PaymentDbService + RefundService used by OrderCancellationService
  ],
  controllers: [OrderController, AdminOrderController],
  providers: [
    OrderDbService,
    OrderCreationService,
    OrderCancellationService,
    OrderStatusService,
    OrderQueryService,
    OrderService,
    OrderPaymentTimeoutCron,
  ],
  exports: [
    OrderDbService,
    OrderCreationService,
    OrderCancellationService,
    OrderStatusService,
    OrderQueryService,
    OrderService,
    OrderPaymentTimeoutCron,
  ],
})
export class OrderModule {}
