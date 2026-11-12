import { Injectable, Logger } from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class AddressDbService {
  private readonly logger = new Logger(AddressDbService.name);

  constructor(private readonly db: DatabaseService) {}

  private getClient(
    tx?: Prisma.TransactionClient,
  ): Prisma.TransactionClient | DatabaseService {
    return tx ?? this.db;
  }

  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(fn);
  }

  async findManyByUserId(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Address[]> {
    const client = this.getClient(tx);
    return client.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findByIdAndUserId(
    id: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Address | null> {
    const client = this.getClient(tx);
    return client.address.findFirst({
      where: { id, userId },
    });
  }

  async findNewestByUserId(
    userId: string,
    excludeId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Address | null> {
    const client = this.getClient(tx);
    return client.address.findFirst({
      where: {
        userId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async countByUserId(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = this.getClient(tx);
    return client.address.count({
      where: { userId },
    });
  }

  async unsetDefaultsForUser(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = this.getClient(tx);
    const result = await client.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
    return result.count;
  }

  async create(
    data: Prisma.AddressUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Address> {
    const client = this.getClient(tx);
    return client.address.create({ data });
  }

  async update(
    id: string,
    userId: string,
    data: Prisma.AddressUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Address> {
    const client = this.getClient(tx);
    return client.address.update({
      where: {
        id_userId: { id, userId },
      },
      data,
    });
  }

  async delete(
    id: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Address> {
    const client = this.getClient(tx);
    return client.address.delete({
      where: {
        id_userId: { id, userId },
      },
    });
  }
}
