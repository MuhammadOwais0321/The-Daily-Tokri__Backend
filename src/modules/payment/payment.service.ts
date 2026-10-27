import { Injectable } from '@nestjs/common';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

@Injectable()
export class PaymentService {
  initiate(initiatePaymentDto: InitiatePaymentDto) {
    return 'This action initiates a payment';
  }

  findAll() {
    return `This action returns all payment`;
  }

  findOne(id: number) {
    return `This action returns a #${id} payment`;
  }

  remove(id: number) {
    return `This action removes a #${id} payment`;
  }
}
