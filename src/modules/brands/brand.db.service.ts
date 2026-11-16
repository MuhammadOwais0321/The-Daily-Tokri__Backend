import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Brand, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { BrandQueryDto } from './dto';
import { brandInclude, BrandWithRelations } from './types';

@Injectable()
export class BrandDbService {
  private readonly logger = new Logger(BrandDbService.name);
  readonly brandInclude = brandInclude;

  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<BrandWithRelations | null> {
    return this.db.brand.findUnique({
      where: { id },
      include: this.brandInclude,
    });
  }

  /** Checks whether another brand already uses the given name or slug. */
  async findConflictByNameOrSlug(
    name: string,
    slug: string,
    excludeId?: string,
  ): Promise<Pick<Brand, 'id' | 'name' | 'slug'> | null> {
    return this.db.brand.findFirst({
      where: {
        OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug }],
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });
  }

  async findMany(query: BrandQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.BrandWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.db.brand.findMany({
        where,
        include: this.brandInclude,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.db.brand.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async create(data: Prisma.BrandCreateInput): Promise<BrandWithRelations> {
    try {
      return await this.db.brand.create({
        data,
        include: this.brandInclude,
      });
    } catch (error) {
      this.handlePrismaError(error, 'create brand');
    }
  }

  async update(
    id: string,
    data: Prisma.BrandUpdateInput,
  ): Promise<BrandWithRelations> {
    try {
      return await this.db.brand.update({
        where: { id },
        data,
        include: this.brandInclude,
      });
    } catch (error) {
      this.handlePrismaError(error, 'update brand');
    }
  }

  async delete(id: string): Promise<Brand> {
    try {
      return await this.db.brand.delete({
        where: { id },
      });
    } catch (error) {
      this.handlePrismaError(error, 'delete brand');
    }
  }

  private handlePrismaError(error: unknown, action: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'A brand with this name or slug already exists',
        );
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Brand not found');
      }
      if (error.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete brand because it has associated products. Reassign or remove the products first.',
        );
      }
    }

    this.logger.error(
      `Failed to ${action}: ${(error as Error).message}`,
      (error as Error).stack,
    );
    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}
