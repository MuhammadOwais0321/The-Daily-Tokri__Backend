import { Prisma } from '@prisma/client';
import { PaginationMeta } from '../../../common/pagination';

export const brandInclude = {
  _count: {
    select: {
      products: true,
    },
  },
} satisfies Prisma.BrandInclude;

export type BrandWithRelations = Prisma.BrandGetPayload<{
  include: typeof brandInclude;
}>;

export interface IBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBrandListResponse {
  data: IBrand[];
  meta: PaginationMeta;
}
