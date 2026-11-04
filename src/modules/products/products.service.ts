import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ProductsDbService } from './products.db.service';
import { CategoryService } from '../category/category.service';
import { AuditService } from '../audit/audit.service';
import { S3Service } from '../../common/services/s3.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
  CreateProductAllergenDto,
  UpdateProductImageDto,
} from './dto';
import {
  IProduct,
  IProductListResponse,
  IProductSummary,
  IPublicProduct,
  IAdminProduct,
  IPublicProductSummary,
  IAdminProductSummary,
  IPublicProductListResponse,
  IAdminProductListResponse,
} from './types';
import {
  toProductResponse,
  toProductSummary,
  toPublicProductResponse,
  toAdminProductResponse,
  toPublicProductSummary,
  toAdminProductSummary,
} from './mappers';
import { AuditActorType } from '../../common/enums';
import { buildMeta } from '../../common/pagination';
import { Category as PrismaCategory, Prisma } from '@prisma/client';
import { ICategory } from '../category/types';
import { slugify } from '../../common/utils';
import 'multer';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly productDb: ProductsDbService,
    private readonly categoryService: CategoryService,
    private readonly auditService: AuditService,
    private readonly s3Service: S3Service,
  ) {}

  async create(dto: CreateProductDto, adminId?: string): Promise<IAdminProduct> {
    const trimmedName = dto.name.trim();

    // 1. Min/Max order quantity constraint
    if (dto.maximumOrderQuantity < dto.minimumOrderQuantity) {
      throw new BadRequestException(
        'Maximum order quantity must be greater than or equal to minimum order quantity',
      );
    }

    // 2. Leaf and Active category check (Docs rule)
    const category = await this.categoryService.ensureLeafAndActive(
      dto.categoryId,
    );

    // 3. Name uniqueness per category
    const existingName = await this.productDb.findByNameAndCategory(
      trimmedName,
      dto.categoryId,
    );
    if (existingName) {
      throw new ConflictException(
        `A product with name "${trimmedName}" already exists in this category`,
      );
    }

    // 4. Barcode uniqueness if provided
    if (dto.barcode && dto.barcode.trim()) {
      const existingBarcode = await this.productDb.findByBarcode(
        dto.barcode.trim(),
      );
      if (existingBarcode) {
        throw new ConflictException(
          `A product with barcode "${dto.barcode.trim()}" already exists`,
        );
      }
    }

    // 5. Generate Slug: <categorySlug>-<nameSlug>[-n]
    const baseSlug = `${category.slug}-${slugify(trimmedName)}`;
    let slug = baseSlug;
    let counter = 1;
    while (await this.productDb.findBySlug(slug)) {
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    // 6. Generate SKU via sequence: <CAT3>-<000001>
    const sku = await this.productDb.getNextSku(category.slug || category.name);

    // 7. Persist product in DB
    const created = await this.productDb.create({
      name: trimmedName,
      slug,
      sku,
      barcode: dto.barcode?.trim() || null,
      description: dto.description?.trim() || null,
      price: new Prisma.Decimal(dto.price),
      minimumOrderQuantity: dto.minimumOrderQuantity,
      maximumOrderQuantity: dto.maximumOrderQuantity,
      storageType: dto.storageType,
      shelfLifeDays: dto.shelfLifeDays,
      unitOfMeasure: dto.unitOfMeasure,
      batchTracked: dto.batchTracked ?? false,
      isActive: dto.isActive ?? true,
      isVisible: dto.isVisible ?? true,
      category: { connect: { id: dto.categoryId } },
      brand: dto.brandId ? { connect: { id: dto.brandId } } : undefined,
      supplier: dto.supplierId
        ? { connect: { id: dto.supplierId } }
        : undefined,
    });

    this.logger.log(`Product created: ${created.name} (${created.id}) with SKU ${created.sku}`);

    // 8. Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'PRODUCT',
        entityId: created.id,
        action: 'CREATE_PRODUCT',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          name: created.name,
          sku: created.sku,
          price: created.price.toString(),
          categoryId: created.categoryId,
        },
      })
      .catch((err) => {
        this.logger.error('Failed to log product create audit event', err);
      });

    return toAdminProductResponse(created);
  }

  async findAll(
    query: ListProductsQueryDto,
    isPublic: true,
  ): Promise<IPublicProductListResponse>;
  async findAll(
    query: ListProductsQueryDto,
    isPublic?: false,
  ): Promise<IAdminProductListResponse>;
  async findAll(
    query: ListProductsQueryDto,
    isPublic: boolean = false,
  ): Promise<IPublicProductListResponse | IAdminProductListResponse> {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException('minPrice cannot be greater than maxPrice');
    }

    const { data, total, page, limit } = await this.productDb.findMany(
      query,
      isPublic,
    );

    return {
      data: isPublic
        ? data.map(toPublicProductSummary)
        : data.map(toAdminProductSummary),
      meta: buildMeta(total, page, limit),
    };
  }

  async findOne(id: string, isPublic: true): Promise<IPublicProduct>;
  async findOne(id: string, isPublic?: false): Promise<IAdminProduct>;
  async findOne(
    id: string,
    isPublic: boolean = false,
  ): Promise<IPublicProduct | IAdminProduct> {
    const product = await this.productDb.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (isPublic && (!product.isActive || !product.isVisible)) {
      throw new NotFoundException('Product not found');
    }

    return isPublic
      ? toPublicProductResponse(product)
      : toAdminProductResponse(product);
  }

  async findBySlug(slug: string, isPublic: true): Promise<IPublicProduct>;
  async findBySlug(slug: string, isPublic?: false): Promise<IAdminProduct>;
  async findBySlug(
    slug: string,
    isPublic: boolean = false,
  ): Promise<IPublicProduct | IAdminProduct> {
    const product = await this.productDb.findBySlug(slug);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (isPublic && (!product.isActive || !product.isVisible)) {
      throw new NotFoundException('Product not found');
    }

    return isPublic
      ? toPublicProductResponse(product)
      : toAdminProductResponse(product);
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    adminId?: string,
  ): Promise<IAdminProduct> {
    const product = await this.productDb.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // 1. Min/Max quantity check
    const minQty = dto.minimumOrderQuantity ?? product.minimumOrderQuantity;
    const maxQty = dto.maximumOrderQuantity ?? product.maximumOrderQuantity;
    if (maxQty < minQty) {
      throw new BadRequestException(
        'Maximum order quantity must be greater than or equal to minimum order quantity',
      );
    }

    // 2. Category change validation
    let targetCategory: PrismaCategory | ICategory | null | undefined =
      product.category;
    const categoryChanged =
      dto.categoryId !== undefined && dto.categoryId !== product.categoryId;

    if (categoryChanged) {
      const newCategory = await this.categoryService.ensureLeafAndActive(
        dto.categoryId!,
      );
      targetCategory = newCategory;
    }

    // 3. Name uniqueness in category check
    const trimmedName = dto.name !== undefined ? dto.name.trim() : undefined;
    const targetName = trimmedName ?? product.name;
    const targetCategoryId = dto.categoryId ?? product.categoryId;

    const nameChanged =
      trimmedName !== undefined && trimmedName !== product.name;

    if (nameChanged || categoryChanged) {
      const existing = await this.productDb.findByNameAndCategory(
        targetName,
        targetCategoryId,
      );
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `A product with name "${targetName}" already exists in this category`,
        );
      }
    }

    // 4. Barcode uniqueness check
    if (dto.barcode !== undefined) {
      const trimmedBarcode = dto.barcode ? dto.barcode.trim() : null;
      if (trimmedBarcode && trimmedBarcode !== product.barcode) {
        const existingBarcode = await this.productDb.findByBarcode(
          trimmedBarcode,
        );
        if (existingBarcode && existingBarcode.id !== id) {
          throw new ConflictException(
            `A product with barcode "${trimmedBarcode}" already exists`,
          );
        }
      }
    }

    // 5. Batch tracked constraint: true -> false requires NO active batches
    if (dto.batchTracked === false && product.batchTracked === true) {
      const hasActive = await this.productDb.hasActiveBatches(id);
      if (hasActive) {
        throw new BadRequestException(
          'Cannot disable batch tracking for a product with active batches',
        );
      }
    }

    // 6. Generate Slug if name or category changed: <categorySlug>-<nameSlug>[-n]
    let newSlug: string | undefined = undefined;
    if (nameChanged || categoryChanged) {
      const categorySlug =
        targetCategory?.slug ||
        (await this.categoryService.ensureLeafAndActive(targetCategoryId)).slug;

      const baseSlug = `${categorySlug}-${slugify(targetName)}`;
      let slugCandidate = baseSlug;
      let counter = 1;
      let existingSlugProduct = await this.productDb.findBySlug(slugCandidate);
      while (existingSlugProduct && existingSlugProduct.id !== id) {
        counter++;
        slugCandidate = `${baseSlug}-${counter}`;
        existingSlugProduct = await this.productDb.findBySlug(slugCandidate);
      }
      newSlug = slugCandidate;
    }

    const updateData: Prisma.ProductUpdateInput = {
      name: trimmedName,
      slug: newSlug,
      description:
        dto.description !== undefined ? dto.description.trim() || null : undefined,
      barcode:
        dto.barcode !== undefined ? dto.barcode.trim() || null : undefined,
      price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
      minimumOrderQuantity: dto.minimumOrderQuantity,
      maximumOrderQuantity: dto.maximumOrderQuantity,
      storageType: dto.storageType,
      shelfLifeDays: dto.shelfLifeDays,
      unitOfMeasure: dto.unitOfMeasure,
      batchTracked: dto.batchTracked,
      isActive: dto.isActive,
      isVisible: dto.isVisible,
      category: dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : undefined,
      brand:
        dto.brandId !== undefined
          ? dto.brandId
            ? { connect: { id: dto.brandId } }
            : { disconnect: true }
          : undefined,
      supplier:
        dto.supplierId !== undefined
          ? dto.supplierId
            ? { connect: { id: dto.supplierId } }
            : { disconnect: true }
          : undefined,
    };

    const updated = await this.productDb.update(id, updateData);

    this.logger.log(`Product updated: ${updated.name} (${updated.id})`);

    // Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'PRODUCT',
        entityId: updated.id,
        action: 'UPDATE_PRODUCT',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          name: updated.name,
          changes: dto,
        },
      })
      .catch((err) => {
        this.logger.error('Failed to log product update audit event', err);
      });

    return toAdminProductResponse(updated);
  }

  async remove(id: string, adminId?: string): Promise<void> {
    const product = await this.productDb.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check references before deleting
    const refs = await this.productDb.hasReferences(id);
    if (refs.hasOrders || refs.hasCart || refs.hasInventory) {
      throw new ConflictException(
        'Cannot delete product because it is referenced by existing orders, carts, or active inventory. Consider setting isActive: false instead.',
      );
    }

    await this.productDb.delete(id);

    // Clean up images from S3 (best effort) after DB delete
    for (const image of product.images || []) {
      await this.s3Service.deleteFile(image.url);
    }

    this.logger.log(`Product deleted: ${product.name} (${product.id})`);

    // Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'PRODUCT',
        entityId: product.id,
        action: 'DELETE_PRODUCT',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          name: product.name,
          sku: product.sku,
        },
      })
      .catch((err) => {
        this.logger.error('Failed to log product delete audit event', err);
      });
  }

  // --- Images Sub-Resource ---

  async uploadImages(
    productId: string,
    files: Express.Multer.File[],
    isPrimaryIndex: number = 0,
    adminId?: string,
  ): Promise<IAdminProduct> {
    const product = await this.productDb.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('At least one image file is required');
    }

    const currentCount = await this.productDb.countImages(productId);
    if (currentCount + files.length > 3) {
      throw new BadRequestException(
        `A product can have a maximum of 3 images. Currently has ${currentCount}, tried to add ${files.length}.`,
      );
    }

    const uploadedUrls: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploadedUrl = await this.s3Service.uploadFile(file, 'products');
        uploadedUrls.push(uploadedUrl);

        const sortOrder = currentCount + i;
        const isPrimary = currentCount === 0 && i === isPrimaryIndex;

        await this.productDb.addImage(productId, {
          url: uploadedUrl,
          sortOrder,
          isPrimary,
        });
      }
    } catch (error) {
      // Rollback uploaded files
      for (const url of uploadedUrls) {
        await this.s3Service.deleteFile(url);
      }
      throw error;
    }

    const refreshed = await this.productDb.findById(productId);

    // Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'PRODUCT',
        entityId: productId,
        action: 'UPLOAD_PRODUCT_IMAGES',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: { count: files.length, urls: uploadedUrls },
      })
      .catch((err) => {
        this.logger.error('Failed to log image upload audit event', err);
      });

    return toAdminProductResponse(refreshed!);
  }

  async updateImage(
    productId: string,
    imageId: string,
    dto: UpdateProductImageDto,
    adminId?: string,
  ): Promise<IAdminProduct> {
    const image = await this.productDb.findImageById(imageId);
    if (!image || image.productId !== productId) {
      throw new NotFoundException('Image not found for this product');
    }

    if (dto.isPrimary === false && image.isPrimary) {
      const count = await this.productDb.countImages(productId);
      if (count <= 1) {
        throw new BadRequestException(
          'Cannot remove primary status from the only image of a product',
        );
      }
    }

    await this.productDb.runInTransaction(async (tx) => {
      if (dto.isPrimary === true) {
        await this.productDb.clearPrimaryImages(productId, tx);
      }

      await this.productDb.updateImage(
        imageId,
        {
          altText: dto.altText,
          sortOrder: dto.sortOrder,
          isPrimary: dto.isPrimary,
        },
        tx,
      );
    });

    const refreshed = await this.productDb.findById(productId);

    // Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'PRODUCT',
        entityId: productId,
        action: 'UPDATE_PRODUCT_IMAGE',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: { imageId, changes: dto },
      })
      .catch((err) => {
        this.logger.error('Failed to log image update audit event', err);
      });

    return toAdminProductResponse(refreshed!);
  }

  async deleteImage(
    productId: string,
    imageId: string,
    adminId?: string,
  ): Promise<IAdminProduct> {
    const image = await this.productDb.findImageById(imageId);
    if (!image || image.productId !== productId) {
      throw new NotFoundException('Image not found for this product');
    }

    const count = await this.productDb.countImages(productId);
    if (count <= 1) {
      throw new BadRequestException(
        'Cannot delete the only image of a product',
      );
    }

    await this.productDb.runInTransaction(async (tx) => {
      await this.productDb.deleteImage(imageId, tx);

      // If deleted image was primary, set another image as primary if available
      if (image.isPrimary) {
        const remainingImages = await this.productDb.findImagesByProductId(
          productId,
          tx,
        );
        if (remainingImages.length > 0) {
          await this.productDb.updateImage(
            remainingImages[0].id,
            { isPrimary: true },
            tx,
          );
        }
      }
    });

    // Clean up file from S3 (best effort) after DB commit
    await this.s3Service.deleteFile(image.url);

    const refreshed = await this.productDb.findById(productId);

    // Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'PRODUCT',
        entityId: productId,
        action: 'DELETE_PRODUCT_IMAGE',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: { imageId, url: image.url },
      })
      .catch((err) => {
        this.logger.error('Failed to log image delete audit event', err);
      });

    return toAdminProductResponse(refreshed!);
  }

  // --- Allergens Sub-Resource ---

  async findAllergens(productId: string) {
    const product = await this.productDb.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.productDb.findAllergensByProductId(productId);
  }

  async addAllergen(
    productId: string,
    dto: CreateProductAllergenDto,
    adminId?: string,
  ) {
    const product = await this.productDb.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existing = (product.allergens || []).find(
      (a) => a.allergen === dto.allergen,
    );
    if (existing) {
      throw new ConflictException(
        `Allergen "${dto.allergen}" is already declared for this product`,
      );
    }

    const allergen = await this.productDb.addAllergen(productId, {
      allergen: dto.allergen,
      presence: dto.presence,
    });

    // Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'PRODUCT',
        entityId: productId,
        action: 'ADD_PRODUCT_ALLERGEN',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: { allergenId: allergen.id, allergen: allergen.allergen },
      })
      .catch((err) => {
        this.logger.error('Failed to log allergen add audit event', err);
      });

    return allergen;
  }

  async deleteAllergen(
    productId: string,
    allergenId: string,
    adminId?: string,
  ): Promise<void> {
    const allergen = await this.productDb.findAllergenById(allergenId);
    if (!allergen || allergen.productId !== productId) {
      throw new NotFoundException('Allergen declaration not found for this product');
    }

    await this.productDb.deleteAllergen(allergenId);

    // Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'PRODUCT',
        entityId: productId,
        action: 'DELETE_PRODUCT_ALLERGEN',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: { allergenId, allergen: allergen.allergen },
      })
      .catch((err) => {
        this.logger.error('Failed to log allergen delete audit event', err);
      });
  }
}
