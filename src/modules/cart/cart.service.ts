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

  /**
   * Calculates currently available stock for a product,
   * taking into account batch tracking and batch expiry dates.
   * Business logic belongs strictly in the service layer.
   */
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

  /**
   * Evaluates stock availability rules for each item and builds the cart response.
   */
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

  /**
   * Retrieves the customer's cart. If the user doesn't have a cart yet,
   * it gets automatically created (get-or-create).
   */
  async getCart(userId: string): Promise<ICartResponse> {
    const cart = await this.cartDb.findOrCreateCart(userId);
    return this.mapCartToResponse(cart);
  }

  /**
   * Adds an item to the customer's cart. If the item already exists in the cart,
   * its quantity is incremented.
   * Validates active status, visibility, available stock, and order quantity limits.
   */
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

  /**
   * Updates the quantity of a specific cart item.
   * If quantity is 0, the item is removed from the cart.
   * Validates item ownership and stock / order quantity limits.
   */
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

  /**
   * Removes an item from the customer's cart.
   * Atomically deletes the item scoped to user's cart in a single query.
   * Throws 404 if item not found, not owned, or already deleted by another concurrent request.
   */
  async removeItem(userId: string, itemId: string): Promise<void> {
    const deletedCount = await this.cartDb.deleteCartItemByIdAndUserId(
      itemId,
      userId,
    );
    if (deletedCount === 0) {
      throw new NotFoundException('Cart item not found');
    }
  }

  /**
   * Clears all items in the customer's cart.
   */
  async clearCart(userId: string): Promise<void> {
    await this.cartDb.clearCartByUserId(userId);
  }

  /**
   * Helper method for OrderModule to read user's cart in a transaction.
   */
  async getCartForOrder(userId: string, tx?: Prisma.TransactionClient) {
    return this.cartDb.findCartByUserId(userId, tx);
  }

  /**
   * Helper method for OrderModule to clear user's cart in a transaction.
   */
  async clearCartForOrder(userId: string, tx?: Prisma.TransactionClient) {
    return this.cartDb.clearCartByUserId(userId, tx);
  }
}
