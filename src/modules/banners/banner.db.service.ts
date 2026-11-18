import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Banner, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { MAX_BANNERS } from './types';

// Fixed advisory lock key ("BANR") to serialize concurrent banner creations
const BANNER_CREATE_ADVISORY_LOCK_KEY = 726637;

@Injectable()
export class BannerDbService {
  private readonly logger = new Logger(BannerDbService.name);

  constructor(private readonly db: DatabaseService) {}

  async countAll(): Promise<number> {
    return this.db.banner.count();
  }

  async findById(id: string): Promise<Banner | null> {
    return this.db.banner.findUnique({
      where: { id },
    });
  }

  async findMany(onlyActive: boolean): Promise<Banner[]> {
    return this.db.banner.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Atomically creates a banner inside a transaction with an advisory lock
   * so parallel requests can never exceed `MAX_BANNERS`.
   */
  async createWithLimit(data: Prisma.BannerCreateInput): Promise<Banner> {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BANNER_CREATE_ADVISORY_LOCK_KEY})`;

        const currentCount = await tx.banner.count();
        if (currentCount >= MAX_BANNERS) {
          throw new BadRequestException(
            `Maximum of ${MAX_BANNERS} banners allowed`,
          );
        }

        return tx.banner.create({ data });
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.handlePrismaError(error, 'create banner');
    }
  }

  async update(id: string, data: Prisma.BannerUpdateInput): Promise<Banner> {
    try {
      return await this.db.banner.update({
        where: { id },
        data,
      });
    } catch (error) {
      this.handlePrismaError(error, 'update banner');
    }
  }

  async delete(id: string): Promise<Banner> {
    try {
      return await this.db.banner.delete({
        where: { id },
      });
    } catch (error) {
      this.handlePrismaError(error, 'delete banner');
    }
  }

  private handlePrismaError(error: unknown, action: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Banner not found');
      }
    }

    this.logger.error(
      `Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}
