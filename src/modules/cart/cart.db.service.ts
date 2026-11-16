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

  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn);
  }

  /** Finds or creates a cart for the user. */
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

  /** Finds a cart item scoped to the user's cart. */
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

  /** Atomically deletes a cart item scoped to the user's cart and returns the deleted count. */
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

  async clearCartByUserId(userId: string, tx?: Prisma.TransactionClient) {
    const client = this.getClient(tx);
    return client.cartItem.deleteMany({
      where: {
        cart: { userId },
      },
    });
  }
}
