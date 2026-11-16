import { Prisma } from '@prisma/client';
import { PaginationMeta } from '../../../common/pagination';

export const supplierInclude = {
  _count: {
    select: {
      products: true,
    },
  },
} satisfies Prisma.SupplierInclude;

export type SupplierWithRelations = Prisma.SupplierGetPayload<{
  include: typeof supplierInclude;
}>;

export interface ISupplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  contactPerson: string | null;
  address: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISupplierListResponse {
  data: ISupplier[];
  meta: PaginationMeta;
}
