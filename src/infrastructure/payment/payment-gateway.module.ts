import { Module } from '@nestjs/common';
import { MockPaymentGateway } from './mock-payment.gateway';
import { PAYMENT_GATEWAY } from './payment-gateway.interface';

/**
 * Infrastructure module that provides the payment gateway implementation.
 * To swap to a real Stripe gateway: replace MockPaymentGateway with StripeGateway
 * — zero changes needed in business services.
 */
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
