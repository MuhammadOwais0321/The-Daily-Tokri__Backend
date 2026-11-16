import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditActorType, Prisma } from '@prisma/client';
import { buildMeta } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { CreateSupplierDto, SupplierQueryDto, UpdateSupplierDto } from './dto';
import { toSupplierResponse } from './mappers';
import { SupplierDbService } from './supplier.db.service';
import {
  ISupplier,
  ISupplierListResponse,
  SupplierWithRelations,
} from './types';

@Injectable()
export class SupplierService {
  private readonly logger = new Logger(SupplierService.name);

  constructor(
    private readonly supplierDb: SupplierDbService,
    private readonly auditService: AuditService,
  ) {}

  private async getSupplierOrThrow(id: string): Promise<SupplierWithRelations> {
    const supplier = await this.supplierDb.findById(id);
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return supplier;
  }

  private async ensureUniqueEmailAndPhone(
    email?: string,
    phone?: string,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await this.supplierDb.findConflictByEmailOrPhone(
      email,
      phone,
      excludeId,
    );
    if (conflict) {
      if (email && conflict.email.toLowerCase() === email.toLowerCase()) {
        throw new ConflictException(
          `A supplier with email "${email}" already exists`,
        );
      }
      throw new ConflictException(
        `A supplier with phone number "${phone}" already exists`,
      );
    }
  }

  private logAudit(
    action: string,
    entityId: string,
    adminId: string | undefined,
    details: Record<string, unknown>,
  ): void {
    this.auditService
      .log({
        entityType: 'SUPPLIER',
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

  /**
   * Admin: Create a new supplier.
   * Enforces global email & phone uniqueness (409 on conflict).
   * Verified against docs: 01 §22.2, 03 §1.
   */
  async create(dto: CreateSupplierDto, adminId?: string): Promise<ISupplier> {
    await this.ensureUniqueEmailAndPhone(dto.email, dto.phone);

    const created = await this.supplierDb.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      contactPerson: dto.contactPerson || null,
      address: dto.address || null,
      isActive: dto.isActive ?? true,
    });

    this.logger.log(`Supplier created: ${created.name} (${created.id})`);

    this.logAudit('CREATE_SUPPLIER', created.id, adminId, {
      name: created.name,
      email: created.email,
      phone: created.phone,
      isActive: created.isActive,
    });

    return toSupplierResponse(created);
  }

  /**
   * Admin: Paginated supplier list with search and isActive filters.
   */
  async findAll(query: SupplierQueryDto): Promise<ISupplierListResponse> {
    const { data, total, page, limit } = await this.supplierDb.findMany(query);

    return {
      data: data.map(toSupplierResponse),
      meta: buildMeta(total, page, limit),
    };
  }

  /**
   * Admin: Get supplier detail by ID.
   */
  async findOne(id: string): Promise<ISupplier> {
    const supplier = await this.getSupplierOrThrow(id);
    return toSupplierResponse(supplier);
  }

  /**
   * Admin: Update supplier details.
   * Enforces email & phone uniqueness when changed (409 on conflict).
   */
  async update(
    id: string,
    dto: UpdateSupplierDto,
    adminId?: string,
  ): Promise<ISupplier> {
    if (Object.values(dto).every((v) => v === undefined)) {
      throw new BadRequestException(
        'At least one field must be provided to update the supplier',
      );
    }

    const supplier = await this.getSupplierOrThrow(id);

    const emailChanged =
      dto.email !== undefined &&
      dto.email.toLowerCase() !== supplier.email.toLowerCase();
    const phoneChanged =
      dto.phone !== undefined && dto.phone !== supplier.phone;

    if (emailChanged || phoneChanged) {
      await this.ensureUniqueEmailAndPhone(
        emailChanged ? dto.email : undefined,
        phoneChanged ? dto.phone : undefined,
        id,
      );
    }

    const updateData: Prisma.SupplierUpdateInput = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name;
    }
    if (dto.email !== undefined) {
      updateData.email = dto.email;
    }
    if (dto.phone !== undefined) {
      updateData.phone = dto.phone;
    }
    if (dto.contactPerson !== undefined) {
      updateData.contactPerson = dto.contactPerson || null;
    }
    if (dto.address !== undefined) {
      updateData.address = dto.address || null;
    }
    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }

    const updated = await this.supplierDb.update(id, updateData);

    this.logger.log(`Supplier updated: ${updated.name} (${updated.id})`);

    this.logAudit('UPDATE_SUPPLIER', updated.id, adminId, {
      name: updated.name,
      email: updated.email,
      changes: dto,
    });

    return toSupplierResponse(updated);
  }

  /**
   * Admin: Delete supplier.
   * Blocked with 409 Conflict if products are linked to this supplier (Docs 01 §22.2, 03 §7).
   */
  async remove(id: string, adminId?: string): Promise<void> {
    const supplier = await this.getSupplierOrThrow(id);

    if ((supplier._count?.products ?? 0) > 0) {
      throw new ConflictException(
        'Cannot delete supplier because it has associated products. Reassign or remove the products first.',
      );
    }

    await this.supplierDb.delete(id);

    this.logger.log(`Supplier deleted: ${supplier.name} (${supplier.id})`);

    this.logAudit('DELETE_SUPPLIER', supplier.id, adminId, {
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
    });
  }
}
