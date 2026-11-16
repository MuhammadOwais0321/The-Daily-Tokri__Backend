import { Prisma, ReviewStatus } from '@prisma/client';
import { PaginationMeta } from '../../../common/pagination';

export const reviewInclude = {
  images: {
    orderBy: { slot: 'asc' as const },
  },
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      images: {
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
  orderItem: {
    select: {
      id: true,
      orderId: true,
      quantity: true,
      price: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          deliveredAt: true,
        },
      },
    },
  },
} satisfies Prisma.ReviewInclude;

export type ReviewWithRelations = Prisma.ReviewGetPayload<{
  include: typeof reviewInclude;
}>;

export interface IReviewImage {
  id: string;
  reviewId: string;
  url: string;
  slot: number;
  createdAt: Date;
}

export interface IReviewUserSummary {
  id: string;
  name: string;
  email?: string;
}

export interface IReviewProductSummary {
  id: string;
  name: string;
  slug: string;
  sku: string;
  primaryImage: string | null;
}

export interface IReviewResponse {
  id: string;
  orderItemId: string;
  productId: string;
  userId: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  adminReply: string | null;
  isLatest: boolean;
  images: IReviewImage[];
  user?: IReviewUserSummary;
  product?: IReviewProductSummary;
  orderNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRatingBreakdown {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface IProductRatingSummary {
  averageRating: number;
  totalReviews: number;
  ratingBreakdown: IRatingBreakdown;
}

export interface IReviewListResponse {
  data: IReviewResponse[];
  meta: PaginationMeta;
}

export interface IPublicProductReviewsResponse {
  data: IReviewResponse[];
  summary: IProductRatingSummary;
  meta: PaginationMeta;
}
