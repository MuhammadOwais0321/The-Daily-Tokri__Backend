import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BatchStatus, Prisma, StockStatus } from '@prisma/client';
import { CartDbService } from './cart.db.service';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import { toCartResponse } from './mappers';
import { CartItemStockInfo, CartWithRelations, ICartResponse } from './types';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(private readonly cartDb: CartDbService) {}

  /** Computes available stock for a product, accounting for active non-expired batches. */
  private calculateAvailableStock(product: {
    batchTracked: boolean;
    inventory?: {
      qtyOnHand: number;
      batches?: {
        qtyOnHand: number;
        expiryDate: Date;
        status: BatchStatus;
      }[];
    } | null;
  }): number {
    if (!product.inventory) {
      return 0;
    }

    if (product.batchTracked) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeNonExpiredBatches = (product.inventory.batches || []).filter(
        (b) =>
          new Date(b.expiryDate) >= today && b.status === BatchStatus.ACTIVE,
      );

      return activeNonExpiredBatches.reduce(
        (sum, batch) => sum + batch.qtyOnHand,
        0,
      );
    }

    return Math.max(0, product.inventory.qtyOnHand);
  }

  /** Evaluates stock availability for each item and maps the cart response. */
  private mapCartToResponse(cart: CartWithRelations): ICartResponse {
    const stockInfoMap = new Map<string, CartItemStockInfo>();

    for (const item of cart.items || []) {
      const availableStock = this.calculateAvailableStock(item.product);
      const isAvailable =
        item.product.isActive &&
        item.product.isVisible &&
        availableStock >= item.quantity &&
        item.quantity >= item.product.minimumOrderQuantity &&
        item.quantity <= item.product.maximumOrderQuantity;

      const maxAllowedQuantity = Math.max(
        0,
        Math.min(availableStock, item.product.maximumOrderQuantity),
      );

      stockInfoMap.set(item.id, {
        availableStock,
        isAvailable,
        maxAllowedQuantity,
      });
    }

    return toCartResponse(cart, stockInfoMap);
  }

  /** Retrieves or creates the customer's cart. */
  async getCart(userId: string): Promise<ICartResponse> {
    const cart = await this.cartDb.findOrCreateCart(userId);
    return this.mapCartToResponse(cart);
  }

  /** Adds a product to the cart or increments its quantity after validating stock and order limits. */
  async addItem(userId: string, dto: AddToCartDto): Promise<ICartResponse> {
    return this.cartDb.runInTransaction(async (tx) => {
      const cart = await this.cartDb.findOrCreateCart(userId, tx);

      const product = await this.cartDb.findProductWithInventory(
        dto.productId,
        tx,
      );

      if (!product || !product.isActive || !product.isVisible) {
        throw new NotFoundException(
          'Product not found or is currently unavailable',
        );
      }

      const availableStock = this.calculateAvailableStock(product);
      if (
        availableStock <= 0 ||
        product.inventory?.stockStatus === StockStatus.OUT_OF_STOCK
      ) {
        throw new BadRequestException('Product is out of stock');
      }

      const existingItem = await this.cartDb.findCartItemByCartIdAndProductId(
        cart.id,
        dto.productId,
        tx,
      );

      let targetQuantity = dto.quantity;

      if (!existingItem) {
        if (dto.quantity < product.minimumOrderQuantity) {
          throw new BadRequestException(
            `Minimum order quantity for this product is ${product.minimumOrderQuantity}`,
          );
        }
      } else {
        targetQuantity = existingItem.quantity + dto.quantity;
      }

      if (targetQuantity > availableStock) {
        throw new BadRequestException(`Only ${availableStock} units available`);
      }

      if (targetQuantity > product.maximumOrderQuantity) {
        throw new BadRequestException(
          `Maximum order quantity for this product is ${product.maximumOrderQuantity}`,
        );
      }

      if (existingItem) {
        await this.cartDb.updateCartItemQuantity(
          existingItem.id,
          targetQuantity,
          tx,
        );
      } else {
        await this.cartDb.createCartItem(
          cart.id,
          dto.productId,
          targetQuantity,
          tx,
        );
      }

      const updatedCart = await this.cartDb.findCartByUserId(userId, tx);
      return this.mapCartToResponse(updatedCart!);
    });
  }

  /** Updates a cart item's quantity (removes the item when quantity is 0). */
  async updateItem(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<ICartResponse> {
    return this.cartDb.runInTransaction(async (tx) => {
      const item = await this.cartDb.findCartItemByIdAndUserId(
        itemId,
        userId,
        tx,
      );

      if (!item) {
        throw new NotFoundException('Cart item not found');
      }

      if (dto.quantity === 0) {
        await this.cartDb.deleteCartItemByIdAndUserId(itemId, userId, tx);
        const updatedCart = await this.cartDb.findOrCreateCart(userId, tx);
        return this.mapCartToResponse(updatedCart);
      }

      const product = item.product;
      if (!product.isActive || !product.isVisible) {
        throw new BadRequestException('Product is no longer available');
      }

      const availableStock = this.calculateAvailableStock(product);
      if (availableStock <= 0) {
        throw new BadRequestException('Product is out of stock');
      }

      if (dto.quantity < product.minimumOrderQuantity) {
        throw new BadRequestException(
          `Minimum order quantity for this product is ${product.minimumOrderQuantity}`,
        );
      }

      if (dto.quantity > availableStock) {
        throw new BadRequestException(`Only ${availableStock} units available`);
      }

      if (dto.quantity > product.maximumOrderQuantity) {
        throw new BadRequestException(
          `Maximum order quantity for this product is ${product.maximumOrderQuantity}`,
        );
      }

      await this.cartDb.updateCartItemQuantity(itemId, dto.quantity, tx);

      const updatedCart = await this.cartDb.findCartByUserId(userId, tx);
      return this.mapCartToResponse(updatedCart!);
    });
  }

  /** Removes a cart item owned by the customer (throws 404 if not found). */
  async removeItem(userId: string, itemId: string): Promise<void> {
    const deletedCount = await this.cartDb.deleteCartItemByIdAndUserId(
      itemId,
      userId,
    );
    if (deletedCount === 0) {
      throw new NotFoundException('Cart item not found');
    }
  }

  /** Clears all items from the customer's cart. */
  async clearCart(userId: string): Promise<void> {
    await this.cartDb.clearCartByUserId(userId);
  }

  /** Reads the customer's cart within an order transaction. */
  async getCartForOrder(userId: string, tx?: Prisma.TransactionClient) {
    return this.cartDb.findCartByUserId(userId, tx);
  }

  /** Clears the customer's cart within an order transaction. */
  async clearCartForOrder(userId: string, tx?: Prisma.TransactionClient) {
    return this.cartDb.clearCartByUserId(userId, tx);
  }
}
