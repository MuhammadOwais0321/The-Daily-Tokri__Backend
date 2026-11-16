import { Module } from '@nestjs/common';
import { MockPaymentGateway } from './mock-payment.gateway';
import { PAYMENT_GATEWAY } from './payment-gateway.interface';

/** Provides the active `IPaymentGateway` implementation. */
@Module({
  providers: [
    MockPaymentGateway,
    {
      provide: PAYMENT_GATEWAY,
      useClass: MockPaymentGateway,
    },
  ],
  exports: [PAYMENT_GATEWAY, MockPaymentGateway],
})
export class PaymentGatewayModule {}
