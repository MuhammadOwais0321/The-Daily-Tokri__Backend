export const MAX_BANNERS = 5;
export const MAX_BANNER_IMAGE_SIZE = 15 * 1024 * 1024; // 15 MB

export interface IBanner {
  id: string;
  title: string | null;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPublicBannerListResponse {
  data: IBanner[];
}

export interface IAdminBannerListResponse {
  data: IBanner[];
  total: number;
  maxBanners: number;
}
