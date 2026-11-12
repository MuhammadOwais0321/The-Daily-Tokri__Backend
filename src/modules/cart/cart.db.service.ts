import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { CartItemWithProduct, CartWithRelations } from './types';

@Injectable()
export class CartDbService {
  private readonly logger = new Logger(CartDbService.name);

  constructor(private readonly db: DatabaseService) {}

  private getClient(
    tx?: Prisma.TransactionClient,
  ): Prisma.TransactionClient | DatabaseService {
    return tx ?? this.db;
  }

  readonly cartInclude = {
    items: {
      include: {
        product: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' as const },
            },
            inventory: {
              include: {
                batches: {
                  where: { status: 'ACTIVE' as const },
                  orderBy: { expiryDate: 'asc' as const },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' as const },
    },
  };

  /**
   * Executes database operations within an interactive transaction.
   */
  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn);
  }

  /**
   * Finds an existing cart for the user or creates one (Upsert get-or-create).
   */
  async findOrCreateCart(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CartWithRelations> {
    const client = this.getClient(tx);
    return client.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: this.cartInclude,
    });
  }

  /**
   * Finds the cart for a user with all relations if it exists.
   */
  async findCartByUserId(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CartWithRelations | null> {
    const client = this.getClient(tx);
    return client.cart.findUnique({
      where: { userId },
      include: this.cartInclude,
    });
  }

  /**
   * Finds a product with its images and active inventory batches.
   */
  async findProductWithInventory(
    productId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = this.getClient(tx);
    return client.product.findUnique({
      where: { id: productId },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' as const },
        },
        inventory: {
          include: {
            batches: {
              where: { status: 'ACTIVE' as const },
              orderBy: { expiryDate: 'asc' as const },
            },
          },
        },
      },
    });
  }

  /**
   * Finds a single item by cartId and productId.
   */
  async findCartItemByCartIdAndProductId(
    cartId: string,
    productId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CartItemWithProduct | null> {
    const client = this.getClient(tx);
    return client.cartItem.findUnique({
      where: {
        cartId_productId: { cartId, productId },
      },
      include: {
        product: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' as const },
            },
            inventory: {
              include: {
                batches: {
                  where: { status: 'ACTIVE' as const },
                  orderBy: { expiryDate: 'asc' as const },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Finds a cart item by its ID scoped to the authenticated user's cart (Ownership check).
   */
  async findCartItemByIdAndUserId(
    itemId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CartItemWithProduct | null> {
    const client = this.getClient(tx);
    return client.cartItem.findFirst({
      where: {
        id: itemId,
        cart: { userId },
      },
      include: {
        product: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' as const },
            },
            inventory: {
              include: {
                batches: {
                  where: { status: 'ACTIVE' as const },
                  orderBy: { expiryDate: 'asc' as const },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Creates a new cart item.
   */
  async createCartItem(
    cartId: string,
    productId: string,
    quantity: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = this.getClient(tx);
    return client.cartItem.create({
      data: {
        cartId,
        productId,
        quantity,
      },
    });
  }

  /**
   * Updates quantity of an existing cart item.
   */
  async updateCartItemQuantity(
    itemId: string,
    quantity: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = this.getClient(tx);
    return client.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  /**
   * Deletes a cart item by its ID scoped to the user's cart in a single atomic query.
   * Returns the count of deleted records (1 if deleted, 0 if not found/not owned).
   */
  async deleteCartItemByIdAndUserId(
    itemId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = this.getClient(tx);
    const { count } = await client.cartItem.deleteMany({
      where: {
        id: itemId,
        cart: { userId },
      },
    });
    return count;
  }

  /**
   * Clears all items in a cart by userId.
   */
  async clearCartByUserId(userId: string, tx?: Prisma.TransactionClient) {
    const client = this.getClient(tx);
    return client.cartItem.deleteMany({
      where: {
        cart: { userId },
      },
    });
  }
}
