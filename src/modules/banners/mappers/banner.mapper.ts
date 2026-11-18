import { Banner } from '@prisma/client';
import { IBanner } from '../types';

export function toBannerResponse(banner: Banner): IBanner {
  return {
    id: banner.id,
    title: banner.title ?? null,
    subtitle: banner.subtitle ?? null,
    imageUrl: banner.imageUrl,
    linkUrl: banner.linkUrl ?? null,
    sortOrder: banner.sortOrder,
    isActive: banner.isActive,
    createdAt: banner.createdAt,
    updatedAt: banner.updatedAt,
  };
}
