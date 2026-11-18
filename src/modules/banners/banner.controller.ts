import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { BannerService } from './banner.service';
import type { IPublicBannerListResponse } from './types';

@Public()
@Controller('banners')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  /** Public endpoint returning active storefront banners sorted by `sortOrder`. */
  @Get()
  findAll(): Promise<IPublicBannerListResponse> {
    return this.bannerService.findPublic();
  }
}
