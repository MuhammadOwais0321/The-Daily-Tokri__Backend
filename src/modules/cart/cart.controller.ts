import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import { CurrentUser, Roles } from '../../common/decorators';
import { CustomerOnlyGuard } from '../../common/guards';
import { UserRole } from '../../common/enums';
import { RATE_LIMITS } from '../../config/rate-limit.config';

@Throttle(RATE_LIMITS.USER)
@Roles(UserRole.CUSTOMER)
@UseGuards(CustomerOnlyGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /** Get or create the current customer's shopping cart. */
  @Get()
  getCart(@CurrentUser('id') userId: string) {
    return this.cartService.getCart(userId);
  }

  /** Add a product to the cart (increments quantity if already present). */
  @Post('items')
  addItem(
    @CurrentUser('id') userId: string,
    @Body() addToCartDto: AddToCartDto,
  ) {
    return this.cartService.addItem(userId, addToCartDto);
  }

  /** Update cart item quantity (removes item when quantity is 0). */
  @Patch('items/:id')
  updateItem(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) itemId: string,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(userId, itemId, updateCartItemDto);
  }

  /** Remove a specific item from the cart. */
  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) itemId: string,
  ) {
    return this.cartService.removeItem(userId, itemId);
  }

  /** Clear all items from the current customer's cart. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  clearCart(@CurrentUser('id') userId: string) {
    return this.cartService.clearCart(userId);
  }
}
