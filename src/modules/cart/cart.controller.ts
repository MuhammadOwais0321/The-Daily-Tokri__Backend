import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart() {
    return this.cartService.getCart();
  }

  @Post('items')
  addItem(@Body() addToCartDto: AddToCartDto) {
    return this.cartService.addItem(addToCartDto);
  }

  @Put('items/:id')
  updateItem(
    @Param('id') itemId: string,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(itemId, updateCartItemDto);
  }

  @Delete('items/:id')
  removeItem(@Param('id') itemId: string) {
    return this.cartService.removeItem(itemId);
  }

  @Delete()
  clearCart() {
    return this.cartService.clearCart();
  }
}
