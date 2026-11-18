import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ImageValidationPipe } from '../../common/pipes';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import { BannerService } from './banner.service';
import { CreateBannerDto, UpdateBannerDto } from './dto';
import {
  type IAdminBannerListResponse,
  type IBanner,
  MAX_BANNER_IMAGE_SIZE,
} from './types';
import 'multer';

const bannerImageUploadOptions = {
  limits: { fileSize: MAX_BANNER_IMAGE_SIZE },
};

@Roles(UserRole.ADMIN)
@Controller('admin/banners')
export class AdminBannerController {
  constructor(private readonly bannerService: BannerService) {}

  /** Lists all banners (active and inactive) with total and max limit info. */
  @SkipThrottle()
  @Get()
  findAll(): Promise<IAdminBannerListResponse> {
    return this.bannerService.findAdminAll();
  }

  /** Gets single banner detail by UUID. */
  @SkipThrottle()
  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<IBanner> {
    return this.bannerService.findOne(id);
  }

  /** Creates a new banner with an image upload (max 5 banners total, max 15 MB image). */
  @Throttle(RATE_LIMITS.ADMIN_IMAGE_UPLOAD)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('image', bannerImageUploadOptions))
  create(
    @Body() dto: CreateBannerDto,
    @UploadedFile(new ImageValidationPipe(MAX_BANNER_IMAGE_SIZE))
    file: Express.Multer.File,
    @CurrentUser('id') adminId?: string,
  ): Promise<IBanner> {
    return this.bannerService.create(dto, file, adminId);
  }

  /** Updates banner metadata (`title`, `subtitle`, `linkUrl`, `sortOrder`, `isActive`). */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateBannerDto,
    @CurrentUser('id') adminId?: string,
  ): Promise<IBanner> {
    return this.bannerService.update(id, dto, adminId);
  }

  /** Replaces an existing banner image in S3 (max 15 MB image). */
  @Throttle(RATE_LIMITS.ADMIN_IMAGE_UPLOAD)
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('image', bannerImageUploadOptions))
  replaceImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile(new ImageValidationPipe(MAX_BANNER_IMAGE_SIZE))
    file: Express.Multer.File,
    @CurrentUser('id') adminId?: string,
  ): Promise<IBanner> {
    return this.bannerService.replaceImage(id, file, adminId);
  }

  /** Deletes a banner and its S3 image. */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') adminId?: string,
  ): Promise<void> {
    return this.bannerService.remove(id, adminId);
  }
}
