import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import {
  CategoryWithRelations,
  ICategoryFilters,
  ICategoryListResponse,
} from './types';
import { buildMeta } from '../../common/pagination';
import { toCategoryResponse } from './mappers';

@Injectable()
export class CategoryDbService {
  private readonly logger = new Logger(CategoryDbService.name);

  constructor(private readonly db: DatabaseService) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.db;
  }

  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn);
  }

  async findById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CategoryWithRelations | null> {
    const client = this.getClient(tx);
    return client.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          orderBy: { name: 'asc' },
        },
        _count: {
          select: { products: true, children: true },
        },
      },
    });
  }

  async findByName(
    name: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Category | null> {
    const client = this.getClient(tx);
    return client.category.findUnique({
      where: { name },
    });
  }

  async findBySlug(
    slug: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Category | null> {
    const client = this.getClient(tx);
    return client.category.findUnique({
      where: { slug },
    });
  }

  async countBestCategories(
    excludeId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = this.getClient(tx);
    return client.category.count({
      where: {
        bestCategory: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async countProducts(
    categoryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = this.getClient(tx);
    return client.product.count({
      where: { categoryId },
    });
  }

  async hasProducts(
    categoryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const count = await this.countProducts(categoryId, tx);
    return count > 0;
  }

  async countChildren(
    categoryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = this.getClient(tx);
    return client.category.count({
      where: { parentId: categoryId },
    });
  }

  async hasChildren(
    categoryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const count = await this.countChildren(categoryId, tx);
    return count > 0;
  }

  async findDescendants(
    pathPrefix: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Category[]> {
    const client = this.getClient(tx);
    return client.category.findMany({
      where: {
        path: {
          startsWith: pathPrefix,
        },
      },
      orderBy: { depth: 'asc' },
    });
  }

  async listCategories(
    filters: ICategoryFilters,
    tx?: Prisma.TransactionClient,
  ): Promise<ICategoryListResponse> {
    const client = this.getClient(tx);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.CategoryWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.bestCategory !== undefined) {
      where.bestCategory = filters.bestCategory;
    }

    if (filters.isLeaf !== undefined) {
      where.isLeaf = filters.isLeaf;
    }

    if (filters.parentId !== undefined) {
      if (
        filters.parentId === null ||
        filters.parentId === 'null' ||
        filters.parentId === 'root'
      ) {
        where.parentId = null;
      } else {
        where.parentId = filters.parentId;
      }
    }

    if (filters.depth !== undefined) {
      where.depth = filters.depth;
    }

    const searchTerm = filters.search?.trim();
    if (searchTerm) {
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { slug: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    try {
      const [total, records] = await Promise.all([
        client.category.count({ where }),
        client.category.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ depth: 'asc' }, { name: 'asc' }],
          include: {
            parent: true,
            _count: {
              select: { products: true, children: true },
            },
          },
        }),
      ]);

      return {
        data: records.map(toCategoryResponse),
        meta: buildMeta(total, page, limit),
      };
    } catch (error) {
      this.logger.error(
        `Failed to list categories: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException('Failed to retrieve categories');
    }
  }

  async getTree(
    onlyActive: boolean = true,
    tx?: Prisma.TransactionClient,
  ): Promise<CategoryWithRelations[]> {
    const client = this.getClient(tx);
    return client.category.findMany({
      where: {
        parentId: null,
        ...(onlyActive ? { isActive: true } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        children: {
          where: onlyActive ? { isActive: true } : undefined,
          orderBy: { name: 'asc' },
          include: {
            children: {
              where: onlyActive ? { isActive: true } : undefined,
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });
  }

  async create(
    data: Prisma.CategoryUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CategoryWithRelations> {
    const client = this.getClient(tx);
    try {
      return await client.category.create({
        data,
        include: {
          parent: true,
          _count: { select: { products: true, children: true } },
        },
      });
    } catch (error) {
      this.handlePrismaError(error, 'create category');
    }
  }

  async update(
    id: string,
    data: Prisma.CategoryUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CategoryWithRelations> {
    const client = this.getClient(tx);
    try {
      return await client.category.update({
        where: { id },
        data,
        include: {
          parent: true,
          _count: { select: { products: true, children: true } },
        },
      });
    } catch (error) {
      this.handlePrismaError(error, 'update category');
    }
  }

  async updateParentIsLeaf(
    parentId: string,
    isLeaf: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    await client.category.update({
      where: { id: parentId },
      data: { isLeaf },
    });
  }

  async updateSubtreePaths(
    oldPathPrefix: string,
    newPathPrefix: string,
    depthDelta: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    const oldLength = oldPathPrefix.length;
    await client.$executeRaw`
      UPDATE "categories"
      SET "path" = ${newPathPrefix} || SUBSTRING("path" FROM ${oldLength + 1}::integer),
          "depth" = "depth" + ${depthDelta}::integer
      WHERE "path" LIKE ${oldPathPrefix + '%'};
    `;
  }

  async delete(id: string, tx?: Prisma.TransactionClient): Promise<Category> {
    const client = this.getClient(tx);
    try {
      return await client.category.delete({
        where: { id },
      });
    } catch (error) {
      this.handlePrismaError(error, 'delete category');
    }
  }

  private handlePrismaError(error: unknown, action: string): never {
    const err = error as { code?: string; message?: string };
    if (err?.code === 'P2002') {
      throw new ConflictException(
        'A category with this name or slug already exists',
      );
    }
    if (err?.code === 'P2025') {
      throw new NotFoundException('Category not found');
    }
    if (err?.code === 'P2003') {
      throw new ConflictException(
        'Cannot perform this action because the category is referenced by other records',
      );
    }
    this.logger.error(`Failed to ${action}: ${err?.message || error}`);
    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}
