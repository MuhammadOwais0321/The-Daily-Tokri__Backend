import { Category as PrismaCategory } from '@prisma/client';
import { PaginationMeta } from '../../../common/pagination';

export const CATEGORY_MAX_DEPTH = 2; // 3 levels: 0 (root), 1 (sub), 2 (sub-sub/leaf)
export const MAX_BEST_CATEGORIES = 4; // Max 4 top-level featured categories

export type CategoryWithRelations = PrismaCategory & {
  parent?: PrismaCategory | null;
  children?: CategoryWithRelations[];
  _count?: {
    products?: number;
    children?: number;
  };
};

export interface ICategoryParentSummary {
  id: string;
  name: string;
  slug: string;
  depth: number;
}

export interface ICategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  parent?: ICategoryParentSummary | null;
  children?: ICategory[];
  depth: number;
  path: string | null;
  isLeaf: boolean;
  bestCategory: boolean;
  isActive: boolean;
  productCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICategoryTreeNode extends ICategory {
  children: ICategoryTreeNode[];
}

export interface ICategoryListResponse {
  data: ICategory[];
  meta: PaginationMeta;
}

export interface ICategoryFilters {
  search?: string;
  parentId?: string | null;
  bestCategory?: boolean;
  isActive?: boolean;
  isLeaf?: boolean;
  depth?: number;
  page?: number;
  limit?: number;
}
