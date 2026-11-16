import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditActorType, Prisma } from '@prisma/client';
import { buildMeta } from '../../common/pagination';
import { S3Service } from '../../common/services/s3.service';
import { slugify } from '../../common/utils';
import { AuditService } from '../audit/audit.service';
import { BrandDbService } from './brand.db.service';
import { BrandQueryDto, CreateBrandDto, UpdateBrandDto } from './dto';
import { toBrandResponse } from './mappers';
import { BrandWithRelations, IBrand, IBrandListResponse } from './types';
import 'multer';

@Injectable()
export class BrandService {
  private readonly logger = new Logger(BrandService.name);

  constructor(
    private readonly brandDb: BrandDbService,
    private readonly s3Service: S3Service,
    private readonly auditService: AuditService,
  ) {}

  private async getBrandOrThrow(id: string): Promise<BrandWithRelations> {
    const brand = await this.brandDb.findById(id);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    return brand;
  }

  private async ensureUniqueNameAndSlug(
    name: string,
    excludeId?: string,
  ): Promise<string> {
    const slug = slugify(name);
    if (!slug) {
      throw new BadRequestException('Invalid brand name provided');
    }

    const conflict = await this.brandDb.findConflictByNameOrSlug(
      name,
      slug,
      excludeId,
    );
    if (conflict) {
      if (conflict.name.toLowerCase() === name.toLowerCase()) {
        throw new ConflictException(
          `A brand with name "${name}" already exists`,
        );
      }
      throw new ConflictException(`A brand with slug "${slug}" already exists`);
    }

    return slug;
  }

  private logAudit(
    action: string,
    entityId: string,
    adminId: string | undefined,
    details: Record<string, unknown>,
  ): void {
    this.auditService
      .log({
        entityType: 'BRAND',
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

  /** Creates a new brand and enforces name/slug uniqueness. */
  async create(dto: CreateBrandDto, adminId?: string): Promise<IBrand> {
    const slug = await this.ensureUniqueNameAndSlug(dto.name);

    const created = await this.brandDb.create({
      name: dto.name,
      slug,
      logoUrl: null,
      isActive: dto.isActive ?? true,
    });

    this.logger.log(`Brand created: ${created.name} (${created.id})`);

    this.logAudit('CREATE_BRAND', created.id, adminId, {
      name: created.name,
      slug: created.slug,
      isActive: created.isActive,
    });

    return toBrandResponse(created);
  }

  /** Returns a paginated brand list with search and active status filters. */
  async findAll(query: BrandQueryDto): Promise<IBrandListResponse> {
    const { data, total, page, limit } = await this.brandDb.findMany(query);

    return {
      data: data.map(toBrandResponse),
      meta: buildMeta(total, page, limit),
    };
  }

  /** Returns brand detail by ID. */
  async findOne(id: string): Promise<IBrand> {
    const brand = await this.getBrandOrThrow(id);
    return toBrandResponse(brand);
  }

  /** Updates brand name or active status and recalculates slug when name changes. */
  async update(
    id: string,
    dto: UpdateBrandDto,
    adminId?: string,
  ): Promise<IBrand> {
    if (dto.name === undefined && dto.isActive === undefined) {
      throw new BadRequestException(
        'At least one field (name or isActive) must be provided to update the brand',
      );
    }

    const brand = await this.getBrandOrThrow(id);

    const updateData: Prisma.BrandUpdateInput = {};

    if (dto.name !== undefined && dto.name !== brand.name) {
      const newSlug = await this.ensureUniqueNameAndSlug(dto.name, id);
      updateData.name = dto.name;
      updateData.slug = newSlug;
    }

    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }

    const updated =
      Object.keys(updateData).length > 0
        ? await this.brandDb.update(id, updateData)
        : brand;

    this.logger.log(`Brand updated: ${updated.name} (${updated.id})`);

    this.logAudit('UPDATE_BRAND', updated.id, adminId, {
      name: updated.name,
      slug: updated.slug,
      changes: dto,
    });

    return toBrandResponse(updated);
  }

  /** Deletes a brand if no products are linked and cleans up its S3 logo. */
  async remove(id: string, adminId?: string): Promise<void> {
    const brand = await this.getBrandOrThrow(id);

    if ((brand._count?.products ?? 0) > 0) {
      throw new ConflictException(
        'Cannot delete brand because it has associated products. Reassign or remove the products first.',
      );
    }

    await this.brandDb.delete(id);

    if (brand.logoUrl) {
      await this.s3Service.deleteFile(brand.logoUrl);
    }

    this.logger.log(`Brand deleted: ${brand.name} (${brand.id})`);

    this.logAudit('DELETE_BRAND', brand.id, adminId, {
      name: brand.name,
      slug: brand.slug,
    });
  }

  /** Uploads a brand logo to S3 and rolls back if the DB update fails. */
  async uploadLogo(
    id: string,
    file: Express.Multer.File,
    adminId?: string,
  ): Promise<IBrand> {
    const brand = await this.getBrandOrThrow(id);
    const oldLogoUrl = brand.logoUrl;

    const newLogoUrl = await this.s3Service.uploadFile(file, 'brands');

    try {
      const updated = await this.brandDb.update(id, {
        logoUrl: newLogoUrl,
      });

      if (oldLogoUrl) {
        await this.s3Service.deleteFile(oldLogoUrl);
      }

      this.logger.log(`Brand logo updated: ${updated.id} -> ${newLogoUrl}`);

      this.logAudit('UPLOAD_BRAND_LOGO', updated.id, adminId, {
        logoUrl: newLogoUrl,
      });

      return toBrandResponse(updated);
    } catch (error) {
      await this.s3Service.deleteFile(newLogoUrl);
      throw error;
    }
  }

  /** Deletes the brand logo from S3 and resets `logoUrl` to null. */
  async deleteLogo(id: string, adminId?: string): Promise<IBrand> {
    const brand = await this.getBrandOrThrow(id);
    const oldLogoUrl = brand.logoUrl;

    const updated = await this.brandDb.update(id, {
      logoUrl: null,
    });

    if (oldLogoUrl) {
      await this.s3Service.deleteFile(oldLogoUrl);
    }

    this.logger.log(`Brand logo removed: ${id}`);

    this.logAudit('DELETE_BRAND_LOGO', updated.id, adminId, {
      previousLogoUrl: oldLogoUrl,
    });

    return toBrandResponse(updated);
  }
}
