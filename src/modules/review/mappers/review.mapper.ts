import { ReviewImage } from '@prisma/client';
import { stripDeletedEmailPrefix } from '../../auth/mappers/auth.mapper';
import { IReviewImage, IReviewResponse, ReviewWithRelations } from '../types';

export function toReviewImageResponse(img: ReviewImage): IReviewImage {
  return {
    id: img.id,
    reviewId: img.reviewId,
    url: img.url,
    slot: img.slot,
    createdAt: img.createdAt,
  };
}

/** Maps a review entity to `IReviewResponse` (omits reviewer email and orderNumber when `isPublic` is true). */
export function toReviewResponse(
  review: ReviewWithRelations,
  options?: { isPublic?: boolean },
): IReviewResponse {
  const isPublic = options?.isPublic ?? false;

  const sortedImages = (review.images || [])
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map(toReviewImageResponse);

  const productImages = review.product?.images || [];
  const primaryImg =
    productImages.find((img) => img.isPrimary) || productImages[0] || null;

  return {
    id: review.id,
    orderItemId: review.orderItemId,
    productId: review.productId,
    userId: review.userId,
    rating: review.rating,
    comment: review.comment ?? null,
    status: review.status,
    adminReply: review.adminReply ?? null,
    isLatest: review.isLatest,
    images: sortedImages,
    user: review.user
      ? {
          id: review.user.id,
          name: review.user.name,
          ...(isPublic
            ? {}
            : { email: stripDeletedEmailPrefix(review.user.email) }),
        }
      : undefined,
    product: review.product
      ? {
          id: review.product.id,
          name: review.product.name,
          slug: review.product.slug,
          sku: review.product.sku,
          primaryImage: primaryImg?.url ?? null,
        }
      : undefined,
    ...(isPublic || !review.orderItem?.order?.orderNumber
      ? {}
      : { orderNumber: review.orderItem.order.orderNumber }),
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

export function toPublicReviewResponse(
  review: ReviewWithRelations,
): IReviewResponse {
  return toReviewResponse(review, { isPublic: true });
}
