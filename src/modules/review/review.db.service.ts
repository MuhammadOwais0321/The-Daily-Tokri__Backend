import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma, ReviewImage, ReviewStatus } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ReviewQueryDto } from './dto';
import {
  IProductRatingSummary,
  IRatingBreakdown,
  reviewInclude,
  ReviewWithRelations,
} from './types';

@Injectable()
export class ReviewDbService {
  private readonly logger = new Logger(ReviewDbService.name);
  readonly reviewInclude = reviewInclude;

  constructor(private readonly db: DatabaseService) {}

  private getClient(
    tx?: Prisma.TransactionClient,
  ): Prisma.TransactionClient | DatabaseService {
    return tx ?? this.db;
  }

  /**
   * Fetches an order item along with its parent order, product, and existing review
   * to validate verified-purchase eligibility (Docs 01 §21).
   */
  async findOrderItemForReview(
    orderItemId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = this.getClient(tx);
    return client.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            userId: true,
            status: true,
            deliveredAt: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
        review: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  /**
   * Checks if a product exists and is publicly visible/active.
   */
  async findPublicProductById(productId: string) {
    return this.db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        isActive: true,
        isVisible: true,
      },
    });
  }

  async findById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReviewWithRelations | null> {
    const client = this.getClient(tx);
    return client.review.findUnique({
      where: { id },
      include: this.reviewInclude,
    });
  }

  /**
   * Atomically creates a new review in PENDING status with isLatest=true,
   * while marking any previous reviews by the same user for the same product as isLatest=false.
   * Verified against docs: 01 §21.
   */
  async createReviewWithLatestFlag(data: {
    orderItemId: string;
    productId: string;
    userId: string;
    rating: number;
    comment: string | null;
  }): Promise<ReviewWithRelations> {
    try {
      return await this.db.$transaction(async (tx) => {
        // Demote previous reviews by the same user for the same product (Docs 01 §21)
        await tx.review.updateMany({
          where: {
            userId: data.userId,
            productId: data.productId,
            isLatest: true,
          },
          data: {
            isLatest: false,
          },
        });

        return tx.review.create({
          data: {
            orderItemId: data.orderItemId,
            productId: data.productId,
            userId: data.userId,
            rating: data.rating,
            comment: data.comment,
            status: ReviewStatus.PENDING,
            isLatest: true,
          },
          include: this.reviewInclude,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Docs 01 §21: Ek order item = ek review (orderItemId @unique) -> dobara 400
        throw new BadRequestException(
          'A review has already been submitted for this order item.',
        );
      }
      this.logger.error(
        `Failed to create review: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException('Failed to create review.');
    }
  }

  /**
   * Updates a customer's review and resets status back to PENDING for re-moderation.
   * Verified against docs: 01 §21.
   */
  async updateCustomerReview(
    id: string,
    data: {
      rating?: number;
      comment?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<ReviewWithRelations> {
    const client = this.getClient(tx);
    return client.review.update({
      where: { id },
      data: {
        ...(data.rating !== undefined ? { rating: data.rating } : {}),
        ...(data.comment !== undefined ? { comment: data.comment } : {}),
        status: ReviewStatus.PENDING,
      },
      include: this.reviewInclude,
    });
  }

  /**
   * Deletes a review and, if it was marked `isLatest: true`, promotes the user's
   * most recent remaining review for the same product to `isLatest: true`.
   */
  async deleteReviewAndPromotePrevious(review: {
    id: string;
    userId: string;
    productId: string;
    isLatest: boolean;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.review.delete({
        where: { id: review.id },
      });

      if (review.isLatest) {
        const previousLatest = await tx.review.findFirst({
          where: {
            userId: review.userId,
            productId: review.productId,
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });

        if (previousLatest) {
          await tx.review.update({
            where: { id: previousLatest.id },
            data: { isLatest: true },
          });
        }
      }
    });
  }

  private buildOrderBy(
    sortBy?: 'newest' | 'highest' | 'lowest',
  ): Prisma.ReviewOrderByWithRelationInput[] {
    switch (sortBy) {
      case 'highest':
        return [{ rating: 'desc' }, { createdAt: 'desc' }];
      case 'lowest':
        return [{ rating: 'asc' }, { createdAt: 'desc' }];
      case 'newest':
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  private buildCommonFilters(query: ReviewQueryDto): Prisma.ReviewWhereInput {
    const where: Prisma.ReviewWhereInput = {};
    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.rating !== undefined) {
      where.rating = query.rating;
    }
    return where;
  }

  private async executePaginatedQuery(
    where: Prisma.ReviewWhereInput,
    query: ReviewQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const orderBy = this.buildOrderBy(query.sortBy);

    const [data, total] = await Promise.all([
      this.db.review.findMany({
        where,
        include: this.reviewInclude,
        skip,
        take: limit,
        orderBy,
      }),
      this.db.review.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Paginated list of a customer's own reviews.
   */
  async findCustomerReviews(userId: string, query: ReviewQueryDto) {
    const where: Prisma.ReviewWhereInput = {
      ...this.buildCommonFilters(query),
      userId,
    };

    if (query.search) {
      where.OR = [
        { comment: { contains: query.search, mode: 'insensitive' } },
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    return this.executePaginatedQuery(where, query);
  }

  /**
   * Public product reviews list (APPROVED + isLatest=true only) along with
   * overall rating summary and 1..5 star breakdown.
   * Uses @@index([productId, status, isLatest]) for fast lookup and aggregation.
   * Verified against docs: 01 §21, 03 §1, 11 §5.
   */
  async findPublicProductReviews(productId: string, query: ReviewQueryDto) {
    const basePublicWhere: Prisma.ReviewWhereInput = {
      productId,
      status: ReviewStatus.APPROVED,
      isLatest: true,
    };

    const listWhere: Prisma.ReviewWhereInput = {
      ...basePublicWhere,
      ...(query.rating !== undefined ? { rating: query.rating } : {}),
    };

    const [{ data, total, page, limit }, groupedRatings] = await Promise.all([
      this.executePaginatedQuery(listWhere, query),
      this.db.review.groupBy({
        by: ['rating'],
        where: basePublicWhere,
        _count: { rating: true },
      }),
    ]);

    const ratingBreakdown: IRatingBreakdown = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    let totalReviews = 0;
    let weightedSum = 0;

    for (const row of groupedRatings) {
      const star = row.rating as 1 | 2 | 3 | 4 | 5;
      const count = row._count.rating;
      if (star >= 1 && star <= 5) {
        ratingBreakdown[star] = count;
        totalReviews += count;
        weightedSum += star * count;
      }
    }

    const averageRating =
      totalReviews > 0 ? Number((weightedSum / totalReviews).toFixed(2)) : 0;

    const summary: IProductRatingSummary = {
      averageRating,
      totalReviews,
      ratingBreakdown,
    };

    return { data, total, page, limit, summary };
  }

  /**
   * Paginated list of all reviews for admin moderation.
   */
  async findAdminReviews(query: ReviewQueryDto) {
    const where: Prisma.ReviewWhereInput = {
      ...this.buildCommonFilters(query),
      ...(query.userId ? { userId: query.userId } : {}),
    };

    if (query.search) {
      where.OR = [
        { comment: { contains: query.search, mode: 'insensitive' } },
        { adminReply: { contains: query.search, mode: 'insensitive' } },
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
        { product: { sku: { contains: query.search, mode: 'insensitive' } } },
        { user: { name: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    return this.executePaginatedQuery(where, query);
  }

  /**
   * Updates review status (APPROVED / REJECTED) and optional adminReply.
   */
  async moderateReview(
    id: string,
    status: ReviewStatus,
    adminReply?: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<ReviewWithRelations> {
    const client = this.getClient(tx);
    return client.review.update({
      where: { id },
      data: {
        status,
        ...(adminReply !== undefined ? { adminReply } : {}),
      },
      include: this.reviewInclude,
    });
  }

  /**
   * Updates admin reply on a review.
   */
  async updateAdminReply(
    id: string,
    adminReply: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<ReviewWithRelations> {
    const client = this.getClient(tx);
    return client.review.update({
      where: { id },
      data: { adminReply },
      include: this.reviewInclude,
    });
  }

  // --- Review Images Management ---

  async findImageById(
    imageId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReviewImage | null> {
    const client = this.getClient(tx);
    return client.reviewImage.findUnique({
      where: { id: imageId },
    });
  }

  /**
   * Inserts review image records with assigned slots (0..4) and resets review status
   * to PENDING if the review was previously moderated.
   */
  async addImagesAndResetStatus(
    reviewId: string,
    images: Array<{ url: string; slot: number }>,
    resetToPending: boolean,
  ): Promise<ReviewWithRelations> {
    try {
      return await this.db.$transaction(async (tx) => {
        for (const img of images) {
          await tx.reviewImage.create({
            data: {
              reviewId,
              url: img.url,
              slot: img.slot,
            },
          });
        }

        if (resetToPending) {
          return tx.review.update({
            where: { id: reviewId },
            data: { status: ReviewStatus.PENDING },
            include: this.reviewInclude,
          });
        }

        const refreshed = await tx.review.findUnique({
          where: { id: reviewId },
          include: this.reviewInclude,
        });
        return refreshed!;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Review image slot is already occupied for this review.',
        );
      }
      this.logger.error(
        `Failed to save review images: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException('Failed to save review images.');
    }
  }

  async deleteImage(
    imageId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReviewImage> {
    const client = this.getClient(tx);
    return client.reviewImage.delete({
      where: { id: imageId },
    });
  }

  /**
   * Computes a customer's average rating across their approved reviews (for profile stats, Docs 01 §22.7).
   */
  async getUserAverageApprovedRating(userId: string): Promise<number> {
    const result = await this.db.review.aggregate({
      where: {
        userId,
        status: ReviewStatus.APPROVED,
      },
      _avg: {
        rating: true,
      },
    });

    return result._avg.rating ? Number(result._avg.rating.toFixed(2)) : 0;
  }
}
