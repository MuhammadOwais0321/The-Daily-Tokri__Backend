import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { PaymentGatewayModule } from '../../infrastructure/payment/payment-gateway.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { RefundRetryCron } from './cron/refund-retry.cron';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentController } from './payment.controller';
import { PaymentDbService } from './payment.db.service';
import { PaymentService } from './payment.service';
import { PaymentInitiationService } from './services/payment-initiation.service';
import { PaymentWebhookService } from './services/payment-webhook.service';
import { RefundService } from './services/refund.service';

@Module({
  imports: [
    DatabaseModule,
    PaymentGatewayModule,
    AuditModule,
    NotificationModule,
  ],
  controllers: [PaymentController, PaymentWebhookController],
  providers: [
    PaymentDbService,
    PaymentInitiationService,
    PaymentWebhookService,
    RefundService,
    PaymentService,
    RefundRetryCron,
  ],
  exports: [
    PaymentService,
    PaymentDbService,
    PaymentInitiationService,
    PaymentWebhookService,
    RefundService,
    RefundRetryCron,
  ],
})
export class PaymentModule {}
