import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Supplier } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { SupplierQueryDto } from './dto';
import { supplierInclude, SupplierWithRelations } from './types';

@Injectable()
export class SupplierDbService {
  private readonly logger = new Logger(SupplierDbService.name);
  readonly supplierInclude = supplierInclude;

  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<SupplierWithRelations | null> {
    return this.db.supplier.findUnique({
      where: { id },
      include: this.supplierInclude,
    });
  }

  /**
   * Checks in a single query whether another supplier already uses the given email (case-insensitive) or phone.
   */
  async findConflictByEmailOrPhone(
    email?: string,
    phone?: string,
    excludeId?: string,
  ): Promise<Pick<Supplier, 'id' | 'email' | 'phone'> | null> {
    const conditions: Prisma.SupplierWhereInput[] = [];
    if (email) {
      conditions.push({ email: { equals: email, mode: 'insensitive' } });
    }
    if (phone) {
      conditions.push({ phone });
    }

    if (conditions.length === 0) {
      return null;
    }

    return this.db.supplier.findFirst({
      where: {
        OR: conditions,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        email: true,
        phone: true,
      },
    });
  }

  async findMany(query: SupplierQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { contactPerson: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.db.supplier.findMany({
        where,
        include: this.supplierInclude,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.db.supplier.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async create(
    data: Prisma.SupplierCreateInput,
  ): Promise<SupplierWithRelations> {
    try {
      return await this.db.supplier.create({
        data,
        include: this.supplierInclude,
      });
    } catch (error) {
      this.handlePrismaError(error, 'create supplier');
    }
  }

  async update(
    id: string,
    data: Prisma.SupplierUpdateInput,
  ): Promise<SupplierWithRelations> {
    try {
      return await this.db.supplier.update({
        where: { id },
        data,
        include: this.supplierInclude,
      });
    } catch (error) {
      this.handlePrismaError(error, 'update supplier');
    }
  }

  async delete(id: string): Promise<Supplier> {
    try {
      return await this.db.supplier.delete({
        where: { id },
      });
    } catch (error) {
      this.handlePrismaError(error, 'delete supplier');
    }
  }

  private handlePrismaError(error: unknown, action: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'A supplier with this email or phone number already exists',
        );
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Supplier not found');
      }
      if (error.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete supplier because it has associated products. Reassign or remove the products first.',
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
