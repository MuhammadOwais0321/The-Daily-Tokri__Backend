import { BrandWithRelations, IBrand } from '../types';

export function toBrandResponse(brand: BrandWithRelations): IBrand {
  return {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    logoUrl: brand.logoUrl ?? null,
    isActive: brand.isActive,
    productCount: brand._count?.products ?? 0,
    createdAt: brand.createdAt,
    updatedAt: brand.updatedAt,
  };
}
