import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditActorType, OrderStatus, ReviewStatus } from '@prisma/client';
import { buildMeta } from '../../common/pagination';
import { S3Service } from '../../common/services/s3.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/types';
import { NotificationService } from '../notification/notification.service';
import {
  AdminReplyReviewDto,
  CreateReviewDto,
  ModerateReviewDto,
  ReviewQueryDto,
  UpdateReviewDto,
} from './dto';
import { toPublicReviewResponse, toReviewResponse } from './mappers';
import { ReviewDbService } from './review.db.service';
import {
  IPublicProductReviewsResponse,
  IReviewListResponse,
  IReviewResponse,
  ReviewWithRelations,
} from './types';
import 'multer';

export const MAX_REVIEW_IMAGES = 5;

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly reviewDb: ReviewDbService,
    private readonly s3Service: S3Service,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  private async getReviewOrThrow(id: string): Promise<ReviewWithRelations> {
    const review = await this.reviewDb.findById(id);
    if (!review) {
      throw new NotFoundException('Review not found.');
    }
    return review;
  }

  private async getOwnedReviewOrThrow(
    id: string,
    userId: string,
  ): Promise<ReviewWithRelations> {
    const review = await this.getReviewOrThrow(id);
    if (review.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access or modify this review.',
      );
    }
    return review;
  }

  private async deleteReviewAndCleanupImages(
    review: ReviewWithRelations,
  ): Promise<void> {
    await this.reviewDb.deleteReviewAndPromotePrevious({
      id: review.id,
      userId: review.userId,
      productId: review.productId,
      isLatest: review.isLatest,
    });

    for (const image of review.images || []) {
      await this.s3Service.deleteFile(image.url);
    }
  }

  private logAudit(
    action: string,
    entityId: string,
    actorType: AuditActorType,
    actorId: string,
    details: Record<string, unknown>,
  ): void {
    this.auditService
      .log({
        entityType: 'REVIEW',
        entityId,
        action,
        actorType,
        actorId,
        details,
      })
      .catch((err) => {
        this.logger.error(
          `Failed to log ${action} audit event: ${(err as Error).message}`,
        );
      });
  }

  /**
   * Customer: Submit a verified-purchase review for an order item from a DELIVERED order.
   *
   * Rules (Docs 01 §21):
   * - Order item must belong to the customer's own DELIVERED order -> otherwise 400
   * - One order item = one review (orderItemId @unique) -> duplicate returns 400
   * - Rating 1-5 integer, comment <= 1000 chars, starts in PENDING status
   * - Demotes previous reviews for the same user + product to isLatest = false
   */
  async create(user: AuthUser, dto: CreateReviewDto): Promise<IReviewResponse> {
    const orderItem = await this.reviewDb.findOrderItemForReview(
      dto.orderItemId,
    );

    if (!orderItem || orderItem.order.userId !== user.id) {
      throw new BadRequestException(
        'You can only review items from your own delivered orders.',
      );
    }

    if (orderItem.order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'You can only review items from delivered orders.',
      );
    }

    if (orderItem.review) {
      throw new BadRequestException(
        'A review has already been submitted for this order item.',
      );
    }

    const created = await this.reviewDb.createReviewWithLatestFlag({
      orderItemId: dto.orderItemId,
      productId: orderItem.productId,
      userId: user.id,
      rating: dto.rating,
      comment: dto.comment || null,
    });

    this.logger.log(
      `Review created: ${created.id} for product ${created.productId} (orderItem ${created.orderItemId}) by user ${user.id}`,
    );

    this.logAudit('CREATE_REVIEW', created.id, AuditActorType.USER, user.id, {
      orderItemId: created.orderItemId,
      productId: created.productId,
      rating: created.rating,
    });

    // Fire-and-forget admin notification for moderation queue
    const productName = orderItem.product?.name || 'a product';
    this.notificationService
      .dispatchAdminNotification({
        title: 'New Product Review Pending Moderation',
        message: `${user.name} submitted a ${created.rating}-star review for "${productName}".`,
        referenceId: created.id,
        referenceEvent: 'REVIEW_SUBMITTED',
      })
      .catch((err) => {
        this.logger.error(
          `Failed to dispatch new review admin notification: ${(err as Error).message}`,
        );
      });

    return toReviewResponse(created);
  }

  /**
   * Customer: List own reviews with pagination and filters.
   */
  async findMyReviews(
    userId: string,
    query: ReviewQueryDto,
  ): Promise<IReviewListResponse> {
    const { data, total, page, limit } =
      await this.reviewDb.findCustomerReviews(userId, query);

    return {
      data: data.map((review) => toReviewResponse(review)),
      meta: buildMeta(total, page, limit),
    };
  }

  /**
   * Public: List approved latest reviews for a product along with rating summary & 1-5 breakdown.
   * Supports sort options: newest, highest, lowest, and optional star rating filter.
   * Verified against docs: 01 §21, api-reference.md.
   */
  async findProductReviews(
    productId: string,
    query: ReviewQueryDto,
  ): Promise<IPublicProductReviewsResponse> {
    const product = await this.reviewDb.findPublicProductById(productId);
    if (!product || !product.isActive || !product.isVisible) {
      throw new NotFoundException('Product not found.');
    }

    const { data, total, page, limit, summary } =
      await this.reviewDb.findPublicProductReviews(productId, query);

    return {
      data: data.map(toPublicReviewResponse),
      summary,
      meta: buildMeta(total, page, limit),
    };
  }

  /**
   * Customer: Get own review detail by ID.
   * Ownership check: returns 403 if review belongs to another user (Docs 01 §21, 06 §2).
   */
  async findCustomerOne(id: string, userId: string): Promise<IReviewResponse> {
    const review = await this.getOwnedReviewOrThrow(id, userId);
    return toReviewResponse(review);
  }

  /**
   * Customer: Edit own review.
   * Resets status back to PENDING for re-moderation (Docs 01 §21).
   * Ownership check: returns 403 if review belongs to another user.
   */
  async update(
    id: string,
    user: AuthUser,
    dto: UpdateReviewDto,
  ): Promise<IReviewResponse> {
    if (dto.rating === undefined && dto.comment === undefined) {
      throw new BadRequestException(
        'At least one field (rating or comment) must be provided to update the review.',
      );
    }

    const review = await this.getOwnedReviewOrThrow(id, user.id);

    const updated = await this.reviewDb.updateCustomerReview(id, {
      rating: dto.rating,
      comment: dto.comment !== undefined ? dto.comment || null : undefined,
    });

    this.logger.log(
      `Review updated by customer ${user.id}: ${updated.id} (status reset to PENDING)`,
    );

    this.logAudit('UPDATE_REVIEW', updated.id, AuditActorType.USER, user.id, {
      previousRating: review.rating,
      newRating: updated.rating,
      previousStatus: review.status,
      newStatus: updated.status,
    });

    return toReviewResponse(updated);
  }

  /**
   * Customer: Delete own review.
   * Ownership check: returns 403 if review belongs to another user.
   * Promotes previous review for same user + product to isLatest = true if applicable,
   * and cleans up S3 images after DB commit.
   */
  async removeCustomerReview(id: string, user: AuthUser): Promise<void> {
    const review = await this.getOwnedReviewOrThrow(id, user.id);

    await this.deleteReviewAndCleanupImages(review);

    this.logger.log(`Review deleted by customer ${user.id}: ${review.id}`);

    this.logAudit('DELETE_REVIEW', review.id, AuditActorType.USER, user.id, {
      productId: review.productId,
      orderItemId: review.orderItemId,
    });
  }

  /**
   * Customer: Upload images for own review (max 5 images per review, unique slots 0..4).
   * Uploads to S3 first, persists to DB in transaction, and rolls back S3 files on failure.
   * Verified against docs: 01 §21, 10 §4.
   */
  async uploadImages(
    reviewId: string,
    user: AuthUser,
    files: Express.Multer.File[],
  ): Promise<IReviewResponse> {
    const review = await this.getOwnedReviewOrThrow(reviewId, user.id);

    if (!files || files.length === 0) {
      throw new BadRequestException('At least one image file is required.');
    }

    const existingImages = review.images || [];
    if (existingImages.length + files.length > MAX_REVIEW_IMAGES) {
      throw new BadRequestException(
        `A review can have a maximum of ${MAX_REVIEW_IMAGES} images. Currently has ${existingImages.length}, tried to add ${files.length}.`,
      );
    }

    const usedSlots = new Set(existingImages.map((img) => img.slot));
    const availableSlots: number[] = [];
    for (
      let slot = 0;
      slot < MAX_REVIEW_IMAGES && availableSlots.length < files.length;
      slot++
    ) {
      if (!usedSlots.has(slot)) {
        availableSlots.push(slot);
      }
    }

    const uploadedUrls: string[] = [];

    try {
      const imagesToInsert: Array<{ url: string; slot: number }> = [];

      for (let i = 0; i < files.length; i++) {
        const uploadedUrl = await this.s3Service.uploadFile(
          files[i],
          'reviews',
        );
        uploadedUrls.push(uploadedUrl);
        imagesToInsert.push({
          url: uploadedUrl,
          slot: availableSlots[i],
        });
      }

      const resetToPending = review.status !== ReviewStatus.PENDING;
      const updated = await this.reviewDb.addImagesAndResetStatus(
        reviewId,
        imagesToInsert,
        resetToPending,
      );

      this.logger.log(
        `Uploaded ${files.length} image(s) for review ${reviewId} by customer ${user.id}`,
      );

      this.logAudit(
        'UPLOAD_REVIEW_IMAGES',
        reviewId,
        AuditActorType.USER,
        user.id,
        {
          count: files.length,
          urls: uploadedUrls,
        },
      );

      return toReviewResponse(updated);
    } catch (error) {
      // Rollback uploaded S3 files on DB or upload failure
      for (const url of uploadedUrls) {
        await this.s3Service.deleteFile(url);
      }
      throw error;
    }
  }

  /**
   * Customer: Delete an image from own review.
   * Ownership check: 403 if review belongs to another user; 404 if review or image not found.
   */
  async deleteImage(
    reviewId: string,
    imageId: string,
    user: AuthUser,
  ): Promise<IReviewResponse> {
    await this.getOwnedReviewOrThrow(reviewId, user.id);

    const image = await this.reviewDb.findImageById(imageId);
    if (!image || image.reviewId !== reviewId) {
      throw new NotFoundException('Review image not found for this review.');
    }

    await this.reviewDb.deleteImage(imageId);

    // Best-effort S3 file cleanup after DB delete
    await this.s3Service.deleteFile(image.url);

    const refreshed = await this.getReviewOrThrow(reviewId);

    this.logger.log(
      `Deleted review image ${imageId} from review ${reviewId} by customer ${user.id}`,
    );

    this.logAudit(
      'DELETE_REVIEW_IMAGE',
      reviewId,
      AuditActorType.USER,
      user.id,
      {
        imageId,
        url: image.url,
      },
    );

    return toReviewResponse(refreshed);
  }

  // --- Admin Moderation Operations ---

  /**
   * Admin: List all reviews with filters (status, rating, productId, userId, search, sortBy).
   */
  async findAdminAll(query: ReviewQueryDto): Promise<IReviewListResponse> {
    const { data, total, page, limit } =
      await this.reviewDb.findAdminReviews(query);

    return {
      data: data.map((review) => toReviewResponse(review)),
      meta: buildMeta(total, page, limit),
    };
  }

  /**
   * Admin: Get single review detail by ID.
   */
  async findAdminOne(id: string): Promise<IReviewResponse> {
    const review = await this.getReviewOrThrow(id);
    return toReviewResponse(review);
  }

  /**
   * Admin: Approve or reject a review (and optionally set an admin reply).
   * Dispatches notification to customer and logs audit event.
   * Verified against docs: 01 §21.
   */
  async moderateStatus(
    id: string,
    admin: AuthUser,
    dto: ModerateReviewDto,
  ): Promise<IReviewResponse> {
    const review = await this.getReviewOrThrow(id);

    const adminReply =
      dto.adminReply !== undefined ? dto.adminReply || null : undefined;

    const updated = await this.reviewDb.moderateReview(
      id,
      dto.status,
      adminReply,
    );

    this.logger.log(
      `Review ${id} moderated: ${review.status} -> ${dto.status} by admin ${admin.id}`,
    );

    this.logAudit(
      'MODERATE_REVIEW',
      review.id,
      AuditActorType.ADMIN,
      admin.id,
      {
        previousStatus: review.status,
        newStatus: dto.status,
        productId: review.productId,
        userId: review.userId,
      },
    );

    // Fire-and-forget customer notification (Docs 01 §21)
    const productName = review.product?.name || 'your purchased product';
    const isApproved = dto.status === ReviewStatus.APPROVED;
    this.notificationService
      .dispatchUserNotification(review.userId, {
        title: isApproved ? 'Review Approved' : 'Review Rejected',
        message: isApproved
          ? `Your review for "${productName}" has been approved and is now live.`
          : `Your review for "${productName}" was not approved by moderation.`,
        referenceId: review.id,
        referenceEvent: `REVIEW_MODERATED_${dto.status}`,
      })
      .catch((err) => {
        this.logger.error(
          `Failed to dispatch review moderation notification: ${(err as Error).message}`,
        );
      });

    return toReviewResponse(updated);
  }

  /**
   * Admin: Add or update reply on a review (max 500 chars).
   * Dispatches notification to customer and logs audit event.
   * Verified against docs: 01 §21.
   */
  async replyToReview(
    id: string,
    admin: AuthUser,
    dto: AdminReplyReviewDto,
  ): Promise<IReviewResponse> {
    const review = await this.getReviewOrThrow(id);

    const updated = await this.reviewDb.updateAdminReply(id, dto.adminReply);

    this.logger.log(`Admin reply updated on review ${id} by admin ${admin.id}`);

    this.logAudit('REPLY_REVIEW', review.id, AuditActorType.ADMIN, admin.id, {
      productId: review.productId,
      userId: review.userId,
      adminReply: dto.adminReply,
    });

    // Notify customer when admin posts a reply (Docs 01 §21)
    const productName = review.product?.name || 'your purchased product';
    this.notificationService
      .dispatchUserNotification(review.userId, {
        title: 'Store Replied to Your Review',
        message: `An administrator replied to your review for "${productName}".`,
        referenceId: review.id,
        referenceEvent: 'REVIEW_ADMIN_REPLY',
      })
      .catch((err) => {
        this.logger.error(
          `Failed to dispatch review reply notification: ${(err as Error).message}`,
        );
      });

    return toReviewResponse(updated);
  }

  /**
   * Admin: Remove reply on a review (idempotent, sets adminReply to null).
   */
  async removeAdminReply(id: string, admin: AuthUser): Promise<void> {
    const review = await this.getReviewOrThrow(id);

    await this.reviewDb.updateAdminReply(id, null);

    this.logger.log(`Admin reply removed on review ${id} by admin ${admin.id}`);

    this.logAudit(
      'DELETE_REVIEW_REPLY',
      review.id,
      AuditActorType.ADMIN,
      admin.id,
      {
        productId: review.productId,
        userId: review.userId,
        previousReply: review.adminReply,
      },
    );
  }

  /**
   * Admin: Delete any review.
   * Promotes previous review for same user + product to isLatest = true if applicable,
   * cleans up S3 images after commit, and logs audit event.
   */
  async removeAdminReview(id: string, admin: AuthUser): Promise<void> {
    const review = await this.getReviewOrThrow(id);

    await this.deleteReviewAndCleanupImages(review);

    this.logger.log(`Review ${review.id} deleted by admin ${admin.id}`);

    this.logAudit(
      'ADMIN_DELETE_REVIEW',
      review.id,
      AuditActorType.ADMIN,
      admin.id,
      {
        productId: review.productId,
        userId: review.userId,
        orderItemId: review.orderItemId,
      },
    );
  }
}
