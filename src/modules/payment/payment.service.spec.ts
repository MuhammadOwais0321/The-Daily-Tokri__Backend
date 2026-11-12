import { Test, TestingModule } from '@nestjs/testing';
import { PAYMENT_GATEWAY } from '../../infrastructure/payment/payment-gateway.interface';
import { PaymentDbService } from './payment.db.service';
import { PaymentService } from './payment.service';
import { PaymentInitiationService } from './services/payment-initiation.service';
import { PaymentWebhookService } from './services/payment-webhook.service';

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PaymentDbService, useValue: {} },
        { provide: PaymentInitiationService, useValue: {} },
        { provide: PaymentWebhookService, useValue: {} },
        { provide: PAYMENT_GATEWAY, useValue: {} },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
