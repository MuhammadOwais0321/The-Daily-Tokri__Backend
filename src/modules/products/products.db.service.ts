import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '@prisma/client';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ProductWithRelations } from './types';
import { AllergenPresence } from '../../common/enums';

@Injectable()
export class ProductsDbService {
  constructor(private readonly db: DatabaseService) {}

  private readonly productInclude = {
    category: true,
    brand: true,
    supplier: true,
    images: {
      orderBy: { sortOrder: 'asc' as const },
    },
    allergens: true,
    inventory: true,
  };

  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn);
  }

  async getNextSku(
    categoryPrefix: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.db;
    const cleanPrefix = (categoryPrefix || 'PRD')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, 'X');

    try {
      const result = await client.$queryRaw<
        { nextval: bigint | number | string }[]
      >(Prisma.sql`SELECT nextval('product_sku_seq') as nextval`);
      const seqNum = Number(result[0].nextval);
      const padded = String(seqNum).padStart(6, '0');
      return `${cleanPrefix}-${padded}`;
    } catch {
      await client.$executeRaw(
        Prisma.sql`CREATE SEQUENCE IF NOT EXISTS "product_sku_seq" START 1;`,
      );
      const result = await client.$queryRaw<
        { nextval: bigint | number | string }[]
      >(Prisma.sql`SELECT nextval('product_sku_seq') as nextval`);
      const seqNum = Number(result[0].nextval);
      const padded = String(seqNum).padStart(6, '0');
      return `${cleanPrefix}-${padded}`;
    }
  }

  async findByNameAndCategory(
    name: string,
    categoryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ProductWithRelations | null> {
    const client = tx ?? this.db;
    return client.product.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        categoryId,
      },
      include: this.productInclude,
    });
  }

  async findBySlug(
    slug: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ProductWithRelations | null> {
    const client = tx ?? this.db;
    return client.product.findUnique({
      where: { slug },
      include: this.productInclude,
    });
  }

  async findBySku(
    sku: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ProductWithRelations | null> {
    const client = tx ?? this.db;
    return client.product.findUnique({
      where: { sku },
      include: this.productInclude,
    });
  }

  async findByBarcode(
    barcode: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ProductWithRelations | null> {
    const client = tx ?? this.db;
    return client.product.findUnique({
      where: { barcode },
      include: this.productInclude,
    });
  }

  async findById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ProductWithRelations | null> {
    const client = tx ?? this.db;
    return client.product.findUnique({
      where: { id },
      include: this.productInclude,
    });
  }

  async create(
    data: Prisma.ProductCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ProductWithRelations> {
    const client = tx ?? this.db;
    try {
      return await client.product.create({
        data,
        include: this.productInclude,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'A product with this unique value (name, slug, sku, or barcode) already exists',
        );
      }
      throw e;
    }
  }

  async update(
    id: string,
    data: Prisma.ProductUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ProductWithRelations> {
    const client = tx ?? this.db;
    try {
      return await client.product.update({
        where: { id },
        data,
        include: this.productInclude,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'A product with this unique value (name, slug, or barcode) already exists',
        );
      }
      throw e;
    }
  }

  async delete(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ProductWithRelations> {
    const client = tx ?? this.db;
    return client.product.delete({
      where: { id },
      include: this.productInclude,
    });
  }

  async findMany(query: ListProductsQueryDto, isPublic: boolean = false) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    if (isPublic) {
      where.isActive = true;
      where.isVisible = true;
    } else {
      if (query.isActive !== undefined) {
        where.isActive = query.isActive;
      }
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.brandId) {
      where.brandId = query.brandId;
    }

    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }

    if (query.storageType) {
      where.storageType = query.storageType;
    }

    if (query.batchTracked !== undefined) {
      where.batchTracked = query.batchTracked;
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {};
      if (query.minPrice !== undefined) {
        where.price.gte = new Prisma.Decimal(query.minPrice);
      }
      if (query.maxPrice !== undefined) {
        where.price.lte = new Prisma.Decimal(query.maxPrice);
      }
    }

    if (query.q && query.q.trim()) {
      const search = query.q.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.allergens && query.allergens.length > 0) {
      where.allergens = {
        none: {
          allergen: { in: query.allergens },
          presence: { not: AllergenPresence.FREE_FROM },
        },
      };
    }

    let orderBy: Prisma.ProductOrderByWithRelationInput = {
      createdAt: 'desc',
    };

    switch (query.sortBy) {
      case 'price_low_to_high':
        orderBy = { price: 'asc' };
        break;
      case 'price_high_to_low':
        orderBy = { price: 'desc' };
        break;
      case 'a_z':
        orderBy = { name: 'asc' };
        break;
      case 'z_a':
        orderBy = { name: 'desc' };
        break;
      case 'best_selling':
        orderBy = { updatedAt: 'desc' };
        break;
      case 'newest':
      case 'recents':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const [data, total] = await Promise.all([
      this.db.product.findMany({
        where,
        include: this.productInclude,
        skip,
        take: limit,
        orderBy,
      }),
      this.db.product.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async hasActiveBatches(
    productId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.db;
    const count = await client.inventoryBatch.count({
      where: {
        inventory: {
          productId,
        },
        status: 'ACTIVE',
      },
    });
    return count > 0;
  }

  async hasReferences(
    productId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ hasOrders: boolean; hasCart: boolean; hasInventory: boolean }> {
    const client = tx ?? this.db;
    const [orderItemCount, cartItemCount, inventoryCount] = await Promise.all([
      client.orderItem.count({ where: { productId } }),
      client.cartItem.count({ where: { productId } }),
      client.inventory.count({
        where: {
          productId,
          qtyOnHand: { gt: 0 },
        },
      }),
    ]);

    return {
      hasOrders: orderItemCount > 0,
      hasCart: cartItemCount > 0,
      hasInventory: inventoryCount > 0,
    };
  }

  // --- Image Management ---

  async findImagesByProductId(
    productId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.productImage.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findImageById(imageId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.db;
    return client.productImage.findUnique({
      where: { id: imageId },
    });
  }

  async countImages(
    productId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.db;
    return client.productImage.count({
      where: { productId },
    });
  }

  async addImage(
    productId: string,
    data: {
      url: string;
      altText?: string | null;
      sortOrder: number;
      isPrimary: boolean;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.productImage.create({
      data: {
        productId,
        url: data.url,
        altText: data.altText ?? null,
        sortOrder: data.sortOrder,
        isPrimary: data.isPrimary,
      },
    });
  }

  async updateImage(
    imageId: string,
    data: Prisma.ProductImageUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.productImage.update({
      where: { id: imageId },
      data,
    });
  }

  async clearPrimaryImages(productId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.db;
    return client.productImage.updateMany({
      where: { productId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  async deleteImage(imageId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.db;
    return client.productImage.delete({
      where: { id: imageId },
    });
  }

  // --- Allergen Management ---

  async findAllergensByProductId(
    productId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.productAllergen.findMany({
      where: { productId },
      orderBy: { allergen: 'asc' },
    });
  }

  async findAllergenById(allergenId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.db;
    return client.productAllergen.findUnique({
      where: { id: allergenId },
    });
  }

  async addAllergen(
    productId: string,
    data: { allergen: string; presence: AllergenPresence },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.db;
    return client.productAllergen.create({
      data: {
        productId,
        allergen: data.allergen.trim().toUpperCase(),
        presence: data.presence,
      },
    });
  }

  async deleteAllergen(allergenId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.db;
    return client.productAllergen.delete({
      where: { id: allergenId },
    });
  }
}
