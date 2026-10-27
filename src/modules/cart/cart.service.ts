import { Injectable } from '@nestjs/common';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
  getCart() {
    return { items: [], subtotal: 0, grandTotal: 0 };
  }

  addItem(addToCartDto: AddToCartDto) {
    return { message: 'Item added to cart', item: addToCartDto };
  }

  updateItem(itemId: string, updateCartItemDto: UpdateCartItemDto) {
    return { message: 'Cart item updated', itemId, updateCartItemDto };
  }

  removeItem(itemId: string) {
    return { message: 'Cart item removed', itemId };
  }

  clearCart() {
    return { message: 'Cart cleared' };
  }
}
