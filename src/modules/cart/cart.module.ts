import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartDbService } from './cart.db.service';

@Module({
  controllers: [CartController],
  providers: [CartService, CartDbService],
  exports: [CartService, CartDbService],
})
export class CartModule {}
