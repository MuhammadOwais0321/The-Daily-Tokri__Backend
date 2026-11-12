import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import type { AuthUser } from '../auth/types';
import {
  InitiatePaymentDto,
  MockCompletePaymentDto,
} from './dto';
import { PaymentService } from './payment.service';

@Throttle(RATE_LIMITS.PAYMENT)
@Roles(UserRole.CUSTOMER)
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Initiates payment for customer's PENDING order.
   * POST /payments/initiate
   * Rate limited: 5 requests / min (Docs 01 §15).
   */
  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  initiate(
    @CurrentUser() user: AuthUser,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentService.initiate(user, dto);
  }

  /**
   * Mock-completes a payment (development / demo gateway simulator).
   * POST /payments/:id/mock-complete
   * Scoped strictly to authenticated customer (IDOR protection).
   */
  @Post(':id/mock-complete')
  @HttpCode(HttpStatus.OK)
  mockComplete(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: MockCompletePaymentDto,
  ) {
    return this.paymentService.mockComplete(user, id, dto);
  }
}
