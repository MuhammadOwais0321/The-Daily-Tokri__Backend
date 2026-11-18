import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditActorType, Banner, Prisma } from '@prisma/client';
import { S3Service } from '../../common/services/s3.service';
import { AuditService } from '../audit/audit.service';
import { BannerDbService } from './banner.db.service';
import { CreateBannerDto, UpdateBannerDto } from './dto';
import { toBannerResponse } from './mappers';
import {
  IAdminBannerListResponse,
  IBanner,
  IPublicBannerListResponse,
  MAX_BANNERS,
} from './types';
import 'multer';

@Injectable()
export class BannerService {
  private readonly logger = new Logger(BannerService.name);

  constructor(
    private readonly bannerDb: BannerDbService,
    private readonly s3Service: S3Service,
    private readonly auditService: AuditService,
  ) {}

  private async getBannerOrThrow(id: string): Promise<Banner> {
    const banner = await this.bannerDb.findById(id);
    if (!banner) {
      throw new NotFoundException('Banner not found');
    }
    return banner;
  }

  private logAudit(
    action: string,
    entityId: string,
    adminId: string | undefined,
    details: Record<string, unknown>,
  ): void {
    this.auditService
      .log({
        entityType: 'BANNER',
        entityId,
        action,
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details,
      })
      .catch((err) => {
        this.logger.error(
          `Failed to log ${action} audit event: ${(err as Error).message}`,
        );
      });
  }

  /** Returns active banners ordered by `sortOrder` for public storefront display. */
  async findPublic(): Promise<IPublicBannerListResponse> {
    const banners = await this.bannerDb.findMany(true);
    return {
      data: banners.map(toBannerResponse),
    };
  }

  /** Returns all banners (active and inactive) along with max-limit metadata for admin. */
  async findAdminAll(): Promise<IAdminBannerListResponse> {
    const banners = await this.bannerDb.findMany(false);
    return {
      data: banners.map(toBannerResponse),
      total: banners.length,
      maxBanners: MAX_BANNERS,
    };
  }

  /** Returns banner detail by UUID for admin. */
  async findOne(id: string): Promise<IBanner> {
    const banner = await this.getBannerOrThrow(id);
    return toBannerResponse(banner);
  }

  /** Uploads a banner image to S3 and creates the banner while enforcing `MAX_BANNERS`. */
  async create(
    dto: CreateBannerDto,
    file: Express.Multer.File,
    adminId?: string,
  ): Promise<IBanner> {
    const existingCount = await this.bannerDb.countAll();
    if (existingCount >= MAX_BANNERS) {
      throw new BadRequestException(
        `Maximum of ${MAX_BANNERS} banners allowed`,
      );
    }

    const imageUrl = await this.s3Service.uploadFile(file, 'banners');

    try {
      const created = await this.bannerDb.createWithLimit({
        title: dto.title ?? null,
        subtitle: dto.subtitle ?? null,
        imageUrl,
        linkUrl: dto.linkUrl ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      });

      this.logger.log(`Banner created: ${created.id}`);

      this.logAudit('CREATE_BANNER', created.id, adminId, {
        title: created.title,
        imageUrl: created.imageUrl,
        sortOrder: created.sortOrder,
        isActive: created.isActive,
      });

      return toBannerResponse(created);
    } catch (error) {
      await this.s3Service.deleteFile(imageUrl);
      throw error;
    }
  }

  /** Updates banner metadata (`title`, `subtitle`, `linkUrl`, `sortOrder`, `isActive`). */
  async update(
    id: string,
    dto: UpdateBannerDto,
    adminId?: string,
  ): Promise<IBanner> {
    if (
      dto.title === undefined &&
      dto.subtitle === undefined &&
      dto.linkUrl === undefined &&
      dto.sortOrder === undefined &&
      dto.isActive === undefined
    ) {
      throw new BadRequestException(
        'At least one field must be provided to update the banner',
      );
    }

    await this.getBannerOrThrow(id);

    const updateData: Prisma.BannerUpdateInput = {};
    if (dto.title !== undefined) {
      updateData.title = dto.title;
    }
    if (dto.subtitle !== undefined) {
      updateData.subtitle = dto.subtitle;
    }
    if (dto.linkUrl !== undefined) {
      updateData.linkUrl = dto.linkUrl;
    }
    if (dto.sortOrder !== undefined) {
      updateData.sortOrder = dto.sortOrder;
    }
    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }

    const updated = await this.bannerDb.update(id, updateData);

    this.logger.log(`Banner updated: ${updated.id}`);

    this.logAudit('UPDATE_BANNER', updated.id, adminId, {
      changes: dto,
    });

    return toBannerResponse(updated);
  }

  /** Replaces a banner's image in S3 and rolls back if the DB update fails. */
  async replaceImage(
    id: string,
    file: Express.Multer.File,
    adminId?: string,
  ): Promise<IBanner> {
    const banner = await this.getBannerOrThrow(id);
    const oldImageUrl = banner.imageUrl;

    const newImageUrl = await this.s3Service.uploadFile(file, 'banners');

    try {
      const updated = await this.bannerDb.update(id, {
        imageUrl: newImageUrl,
      });

      if (oldImageUrl) {
        await this.s3Service.deleteFile(oldImageUrl);
      }

      this.logger.log(`Banner image updated: ${updated.id} -> ${newImageUrl}`);

      this.logAudit('UPLOAD_BANNER_IMAGE', updated.id, adminId, {
        imageUrl: newImageUrl,
      });

      return toBannerResponse(updated);
    } catch (error) {
      await this.s3Service.deleteFile(newImageUrl);
      throw error;
    }
  }

  /** Deletes a banner and cleans up its S3 image. */
  async remove(id: string, adminId?: string): Promise<void> {
    const banner = await this.getBannerOrThrow(id);

    await this.bannerDb.delete(id);
    await this.s3Service.deleteFile(banner.imageUrl);

    this.logger.log(`Banner deleted: ${banner.id}`);

    this.logAudit('DELETE_BANNER', banner.id, adminId, {
      title: banner.title,
      imageUrl: banner.imageUrl,
    });
  }
}
