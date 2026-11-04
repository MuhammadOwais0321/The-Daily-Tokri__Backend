import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CategoryDbService } from './category.db.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto';
import {
  CATEGORY_MAX_DEPTH,
  ICategory,
  ICategoryListResponse,
  ICategoryTreeNode,
  MAX_BEST_CATEGORIES,
} from './types';
import { toCategoryResponse, toCategoryTreeNode } from './mappers';
import { S3Service } from '../../common/services/s3.service';
import { AuditService } from '../audit/audit.service';
import { AuditActorType } from '../../common/enums';
import { slugify } from '../../common/utils';
import 'multer';

export { slugify };

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    private readonly categoryDb: CategoryDbService,
    private readonly s3Service: S3Service,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateCategoryDto,
    adminId?: string,
  ): Promise<ICategory> {
    const trimmedName = dto.name.trim();
    const slug = slugify(trimmedName);

    if (!slug) {
      throw new BadRequestException('Invalid category name provided');
    }

    // 1. Name & Slug uniqueness
    const existingName = await this.categoryDb.findByName(trimmedName);
    if (existingName) {
      throw new ConflictException(
        `A category with name "${trimmedName}" already exists`,
      );
    }

    const existingSlug = await this.categoryDb.findBySlug(slug);
    if (existingSlug) {
      throw new ConflictException(
        `A category with slug "${slug}" already exists`,
      );
    }

    // 2. Hierarchy & Depth calculation
    let depth = 0;
    let path = `/${slug}/`;
    let parentId: string | null = null;

    if (dto.parentId) {
      const parent = await this.categoryDb.findById(dto.parentId);
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }

      // Max depth check: depth can be 0, 1, 2. If parent is already depth 2, cannot add child.
      if (parent.depth >= CATEGORY_MAX_DEPTH) {
        throw new BadRequestException(
          `Maximum category depth of 3 levels (depth 0, 1, 2) reached. Cannot add subcategory under depth ${parent.depth}.`,
        );
      }

      // Parent with products cannot have subcategories -> 409
      const parentHasProducts = await this.categoryDb.hasProducts(parent.id);
      if (parentHasProducts) {
        throw new ConflictException(
          `Cannot create subcategory under parent category "${parent.name}" because it already contains products.`,
        );
      }

      // bestCategory cannot be set on subcategories
      if (dto.bestCategory) {
        throw new BadRequestException(
          'Only top-level (depth 0) categories can be marked as best category',
        );
      }

      depth = parent.depth + 1;
      const parentPath = parent.path || `/${parent.slug}/`;
      path = `${parentPath}${slug}/`;
      parentId = parent.id;
    } else {
      // Top-level category bestCategory check
      if (dto.bestCategory) {
        const bestCount = await this.categoryDb.countBestCategories();
        if (bestCount >= MAX_BEST_CATEGORIES) {
          throw new BadRequestException(
            `Maximum of ${MAX_BEST_CATEGORIES} best categories allowed`,
          );
        }
      }
    }

    // 3. Insert and update parent leaf status in transaction
    const created = await this.categoryDb.runInTransaction(async (tx) => {
      const newCategory = await this.categoryDb.create(
        {
          name: trimmedName,
          slug,
          description: dto.description?.trim() || null,
          imageUrl: null,
          parentId,
          depth,
          path,
          isLeaf: true,
          bestCategory: dto.bestCategory ?? false,
          isActive: dto.isActive ?? true,
        },
        tx,
      );

      // If parent was a leaf, it is now no longer a leaf
      if (parentId) {
        await this.categoryDb.updateParentIsLeaf(parentId, false, tx);
      }

      return newCategory;
    });

    this.logger.log(
      `Category created: ${created.name} (${created.id}) at depth ${created.depth}`,
    );

    // Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'CATEGORY',
        entityId: created.id,
        action: 'CREATE_CATEGORY',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          name: created.name,
          slug: created.slug,
          parentId: created.parentId,
          depth: created.depth,
          isActive: created.isActive,
          bestCategory: created.bestCategory,
        },
      })
      .catch((err) => {
        this.logger.error('Failed to log category create audit event', err);
      });

    return toCategoryResponse(created);
  }

  async findAll(
    query: Partial<CategoryQueryDto> = {},
    isPublic: boolean = false,
  ): Promise<ICategoryListResponse | ICategoryTreeNode[]> {
    // If tree representation requested
    if (query.tree) {
      const onlyActive = isPublic ? true : (query.isActive ?? true);
      const roots = await this.categoryDb.getTree(onlyActive);
      return roots.map(toCategoryTreeNode);
    }

    // For public routes, force isActive = true as recommended in docs
    const effectiveIsActive = isPublic ? true : query.isActive;

    return this.categoryDb.listCategories({
      search: query.search,
      parentId: query.parentId,
      bestCategory: query.bestCategory,
      isActive: effectiveIsActive,
      isLeaf: query.isLeaf,
      depth: query.depth,
      page: query.page,
      limit: query.limit,
    });
  }

  async findOne(id: string, isPublic: boolean = false): Promise<ICategory> {
    const category = await this.categoryDb.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (isPublic && !category.isActive) {
      throw new NotFoundException('Category not found');
    }

    return toCategoryResponse(category);
  }

  async findBySlug(slug: string, isPublic: boolean = false): Promise<ICategory> {
    const category = await this.categoryDb.findBySlug(slug);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (isPublic && !category.isActive) {
      throw new NotFoundException('Category not found');
    }

    return toCategoryResponse(category);
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    adminId?: string,
  ): Promise<ICategory> {
    const category = await this.categoryDb.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    let newName = category.name;
    let newSlug = category.slug;
    let nameChanged = false;

    if (dto.name && dto.name.trim() !== category.name) {
      newName = dto.name.trim();
      newSlug = slugify(newName);
      nameChanged = true;

      const existingName = await this.categoryDb.findByName(newName);
      if (existingName && existingName.id !== id) {
        throw new ConflictException(
          `A category with name "${newName}" already exists`,
        );
      }

      const existingSlug = await this.categoryDb.findBySlug(newSlug);
      if (existingSlug && existingSlug.id !== id) {
        throw new ConflictException(
          `A category with slug "${newSlug}" already exists`,
        );
      }
    }

    // Re-parenting checks
    let targetDepth = category.depth;
    let targetParentId = category.parentId;
    let isParentChanging = false;
    let oldParentId = category.parentId;
    let newPath = category.path || `/${category.slug}/`;

    if (dto.parentId !== undefined) {
      const normalizedTargetParentId =
        dto.parentId === null ||
        dto.parentId === 'null' ||
        dto.parentId === 'root'
          ? null
          : dto.parentId;

      if (normalizedTargetParentId !== category.parentId) {
        isParentChanging = true;

        if (normalizedTargetParentId === category.id) {
          throw new BadRequestException('A category cannot be its own parent');
        }

        if (normalizedTargetParentId === null) {
          // Moving to root
          targetParentId = null;
          targetDepth = 0;
          newPath = `/${newSlug}/`;
        } else {
          // Moving under another parent
          const newParent = await this.categoryDb.findById(
            normalizedTargetParentId,
          );
          if (!newParent) {
            throw new NotFoundException('Target parent category not found');
          }

          // Circular reference check
          const currentPath = category.path || `/${category.slug}/`;
          if (newParent.path && newParent.path.startsWith(currentPath)) {
            throw new BadRequestException(
              'Circular reference: cannot set a descendant category as parent',
            );
          }

          // Target parent with products check
          const targetHasProducts = await this.categoryDb.hasProducts(
            newParent.id,
          );
          if (targetHasProducts) {
            throw new ConflictException(
              `Cannot move category under parent "${newParent.name}" because it already contains products`,
            );
          }

          targetParentId = newParent.id;
          targetDepth = newParent.depth + 1;
          const parentPath = newParent.path || `/${newParent.slug}/`;
          newPath = `${parentPath}${newSlug}/`;
        }

        // Subtree max depth limit check
        const depthDelta = targetDepth - category.depth;
        const maxSubtreeDepth = await this.getMaxSubtreeDepth(category.path);
        if (maxSubtreeDepth + depthDelta > CATEGORY_MAX_DEPTH) {
          throw new BadRequestException(
            `Re-parenting would exceed maximum allowed category depth of 3 levels (depth 0..2)`,
          );
        }
      }
    }

    if (!isParentChanging && nameChanged) {
      // Parent not changing, but slug changed -> recalculate path
      if (category.parentId) {
        const parent = await this.categoryDb.findById(category.parentId);
        const parentPath = parent?.path || `/${parent?.slug}/`;
        newPath = `${parentPath}${newSlug}/`;
      } else {
        newPath = `/${newSlug}/`;
      }
    }

    // bestCategory validation
    const effectiveBestCategory = dto.bestCategory ?? category.bestCategory;
    if (effectiveBestCategory) {
      if (targetDepth !== 0) {
        throw new BadRequestException(
          'Only top-level (depth 0) categories can be marked as best category',
        );
      }
      const bestCount = await this.categoryDb.countBestCategories(id);
      if (bestCount >= MAX_BEST_CATEGORIES) {
        throw new BadRequestException(
          `Maximum of ${MAX_BEST_CATEGORIES} best categories allowed`,
        );
      }
    }

    const updated = await this.categoryDb.runInTransaction(async (tx) => {
      const oldPath = category.path || `/${category.slug}/`;
      const depthDelta = targetDepth - category.depth;

      const record = await this.categoryDb.update(
        id,
        {
          name: newName,
          slug: newSlug,
          description:
            dto.description !== undefined
              ? dto.description?.trim() || null
              : category.description,
          imageUrl: category.imageUrl,
          parentId: targetParentId,
          depth: targetDepth,
          path: newPath,
          bestCategory: effectiveBestCategory,
          isActive: dto.isActive ?? category.isActive,
        },
        tx,
      );

      // If path or depth changed, update all descendants in subtree
      if (oldPath !== newPath || depthDelta !== 0) {
        await this.categoryDb.updateSubtreePaths(
          oldPath,
          newPath,
          depthDelta,
          tx,
        );
      }

      // If parent changed, adjust leaf status of new parent and old parent
      if (isParentChanging) {
        if (targetParentId) {
          await this.categoryDb.updateParentIsLeaf(targetParentId, false, tx);
        }

        if (oldParentId) {
          const remainingChildren =
            await this.categoryDb.countChildren(oldParentId, tx);
          if (remainingChildren === 0) {
            await this.categoryDb.updateParentIsLeaf(oldParentId, true, tx);
          }
        }
      }

      return record;
    });

    this.logger.log(`Category updated: ${updated.name} (${updated.id})`);

    // Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'CATEGORY',
        entityId: updated.id,
        action: 'UPDATE_CATEGORY',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          name: updated.name,
          slug: updated.slug,
          changes: dto,
        },
      })
      .catch((err) => {
        this.logger.error('Failed to log category update audit event', err);
      });

    return toCategoryResponse(updated);
  }

  async remove(id: string, adminId?: string): Promise<void> {
    const category = await this.categoryDb.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // 1. Children check
    const hasChildren = await this.categoryDb.hasChildren(id);
    if (hasChildren) {
      throw new ConflictException(
        'Cannot delete category with subcategories. Reassign or delete subcategories first.',
      );
    }

    // 2. Product check
    const hasProducts = await this.categoryDb.hasProducts(id);
    if (hasProducts) {
      throw new ConflictException(
        'Cannot delete category with associated products. Reassign or remove products first.',
      );
    }

    await this.categoryDb.runInTransaction(async (tx) => {
      await this.categoryDb.delete(id, tx);

      // If deleted category had a parent, check if parent has any remaining children
      if (category.parentId) {
        const remainingChildren = await this.categoryDb.countChildren(
          category.parentId,
          tx,
        );
        if (remainingChildren === 0) {
          await this.categoryDb.updateParentIsLeaf(category.parentId, true, tx);
        }
      }
    });

    if (category.imageUrl) {
      await this.s3Service.deleteFile(category.imageUrl);
    }

    this.logger.log(`Category deleted: ${category.name} (${category.id})`);

    // Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'CATEGORY',
        entityId: category.id,
        action: 'DELETE_CATEGORY',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          name: category.name,
          slug: category.slug,
          depth: category.depth,
        },
      })
      .catch((err) => {
        this.logger.error('Failed to log category delete audit event', err);
      });
  }

  /**
   * Upload category image to S3 (Pattern 2: S3 pehle, phir DB; rollback if DB fails)
   */
  async uploadImage(
    id: string,
    file: Express.Multer.File,
    adminId?: string,
  ): Promise<ICategory> {
    const category = await this.categoryDb.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const oldImageUrl = category.imageUrl;

    const newImageUrl = await this.s3Service.uploadFile(file, 'categories');

    try {
      const updated = await this.categoryDb.update(id, {
        imageUrl: newImageUrl,
      });

      if (oldImageUrl) {
        await this.s3Service.deleteFile(oldImageUrl);
      }

      this.logger.log(
        `Category image updated: ${updated.id} -> ${newImageUrl}`,
      );

      // Fire-and-forget audit log
      this.auditService
        .log({
          entityType: 'CATEGORY',
          entityId: updated.id,
          action: 'UPLOAD_CATEGORY_IMAGE',
          actorType: AuditActorType.ADMIN,
          actorId: adminId,
          details: {
            imageUrl: newImageUrl,
          },
        })
        .catch((err) => {
          this.logger.error(
            'Failed to log category image upload audit event',
            err,
          );
        });

      return toCategoryResponse(updated);
    } catch (error) {
      // Rollback: delete the newly uploaded file since DB update failed
      await this.s3Service.deleteFile(newImageUrl);
      throw error;
    }
  }

  /**
   * Delete category image from S3 and reset category.imageUrl to null
   */
  async deleteImage(id: string, adminId?: string): Promise<ICategory> {
    const category = await this.categoryDb.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const oldImageUrl = category.imageUrl;
    const updated = await this.categoryDb.update(id, {
      imageUrl: null,
    });

    if (oldImageUrl) {
      await this.s3Service.deleteFile(oldImageUrl);
    }

    this.logger.log(`Category image removed: ${id}`);

    // Fire-and-forget audit log
    this.auditService
      .log({
        entityType: 'CATEGORY',
        entityId: updated.id,
        action: 'DELETE_CATEGORY_IMAGE',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          previousImageUrl: oldImageUrl,
        },
      })
      .catch((err) => {
        this.logger.error(
          'Failed to log category image delete audit event',
          err,
        );
      });

    return toCategoryResponse(updated);
  }

  /**
   * Helper used across the application (e.g. Products module)
   * Product can ONLY be assigned to leaf and active categories.
   */
  async ensureLeafAndActive(categoryId: string): Promise<ICategory> {
    const category = await this.categoryDb.findById(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (!category.isActive) {
      throw new BadRequestException(
        `Category "${category.name}" is inactive. Products cannot be assigned to inactive categories.`,
      );
    }

    if (!category.isLeaf) {
      throw new BadRequestException(
        `Category "${category.name}" is not a leaf category. Products can only be assigned to leaf categories.`,
      );
    }

    return toCategoryResponse(category);
  }

  private async getMaxSubtreeDepth(pathPrefix: string | null): Promise<number> {
    if (!pathPrefix) return 0;
    const descendants = await this.categoryDb.findDescendants(pathPrefix);
    if (descendants.length === 0) return 0;
    return Math.max(...descendants.map((d) => d.depth));
  }
}
