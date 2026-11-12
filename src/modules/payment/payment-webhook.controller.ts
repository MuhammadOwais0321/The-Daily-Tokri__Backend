import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators';
import { MockWebhookDto } from './dto';
import { PaymentService } from './payment.service';

/**
 * Handles inbound webhook events from payment gateway (mock / Stripe).
 * Route: POST /webhooks/payments/mock
 * Verified against docs: 01 §16, 05 §8, api-reference Part 2.
 */
@SkipThrottle()
@Public()
@Controller('webhooks/payments')
export class PaymentWebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('mock')
  @HttpCode(HttpStatus.OK)
  async handleMockWebhook(
    @Headers('x-signature') signature: string,
    @Body() body: MockWebhookDto,
    @Req() req: Request,
  ) {
    return this.paymentService.handleWebhook(body, signature, req.body);
  }
}
