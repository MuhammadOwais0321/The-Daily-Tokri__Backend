import { Category as PrismaCategory } from '@prisma/client';
import {
  ICategory,
  ICategoryTreeNode,
  ICategoryParentSummary,
  CategoryWithRelations,
} from '../types';

export function toCategoryParentSummary(
  parent: PrismaCategory | null | undefined,
): ICategoryParentSummary | null {
  if (!parent) return null;
  return {
    id: parent.id,
    name: parent.name,
    slug: parent.slug,
    depth: parent.depth,
  };
}

export function toCategoryResponse(category: CategoryWithRelations): ICategory {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl,
    parentId: category.parentId,
    parent: toCategoryParentSummary(category.parent),
    depth: category.depth,
    path: category.path,
    isLeaf: category.isLeaf,
    bestCategory: category.bestCategory,
    isActive: category.isActive,
    productCount: category._count?.products,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
    children: category.children?.map((child) => toCategoryResponse(child)),
  };
}

export function toCategoryTreeNode(
  category: CategoryWithRelations,
): ICategoryTreeNode {
  const base = toCategoryResponse(category);
  return {
    ...base,
    children: (category.children || []).map((child) =>
      toCategoryTreeNode(child),
    ),
  };
}
