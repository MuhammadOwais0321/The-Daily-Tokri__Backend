import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnvironment } from './config/env.validation';
import { throttlerConfig } from './config/rate-limit.config';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './database';
import { CustomThrottlerGuard, JwtAuthGuard } from './common/guards';
import { UserModule } from './modules/user/user.module';
import { CartModule } from './modules/cart/cart.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ReviewModule } from './modules/review/review.module';
import { CategoryModule } from './modules/category/category.module';
import { BrandModule } from './modules/brands/brand.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { BatchModule } from './modules/batchs/batch.module';
import { NotificationModule } from './modules/notification/notification.module';
import { EventsModule } from './modules/events/events.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot(throttlerConfig),
    DatabaseModule,
    AuthModule,
    UserModule,
    CartModule,
    OrderModule,
    PaymentModule,
    ReviewModule,
    CategoryModule,
    BrandModule,
    SupplierModule,
    ProductsModule,
    InventoryModule,
    BatchModule,
    NotificationModule,
    EventsModule,
    DashboardModule,
    AuditModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
