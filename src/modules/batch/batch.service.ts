import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  AdjustmentReason,
  AuditActorType,
  BatchStatus,
  Prisma,
  StockStatus,
  TransactionType,
} from '@prisma/client';
import * as crypto from 'crypto';
import { buildMeta } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { InventoryDbService } from '../inventory/inventory.db.service';
import { NotificationService } from '../notification/notification.service';
import { BatchDbService } from './batch.db.service';
import { BatchQueryDto, CreateBatchDto, UpdateBatchDto } from './dto';
import { toBatchDetail } from './mappers';
import { IBatchDetail, IBatchListResponse } from './types';

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    private readonly batchDb: BatchDbService,
    @Inject(forwardRef(() => InventoryDbService))
    private readonly inventoryDb: InventoryDbService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  private formatYearMonthDay(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  /** Generates a unique batch code (`BATCH-YYYYMMDD-XXXXXXXXXXXX`). */
  generateBatchCode(): string {
    const dateStr = this.formatYearMonthDay(new Date());
    const randHex = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `BATCH-${dateStr}-${randHex}`;
  }

  /** Validates and parses a batch expiry date that must be today or in the future. */
  parseFutureOrTodayExpiryDate(dateStr: string): Date {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid batch expiry date provided');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed < today) {
      throw new BadRequestException(
        'Expiry date must be today or a future date',
      );
    }

    return parsed;
  }

  /** Creates an initial batch inside an existing inventory-creation transaction. */
  async createInitialBatchInTx(
    tx: Prisma.TransactionClient,
    params: { inventoryId: string; qtyOnHand: number; expiryDate: Date },
  ) {
    const batchCode = this.generateBatchCode();
    return this.batchDb.create(
      {
        inventoryId: params.inventoryId,
        batchCode,
        qtyOnHand: params.qtyOnHand,
        expiryDate: params.expiryDate,
        status: BatchStatus.ACTIVE,
      },
      tx,
    );
  }

  /** Validates and applies a quantity delta to an active non-expired batch inside a transaction. */
  async adjustBatchInTx(
    tx: Prisma.TransactionClient,
    params: { inventoryId: string; batchId?: string; quantity: number },
  ) {
    if (!params.batchId) {
      throw new BadRequestException(
        'Batch ID is required for adjusting inventory of a batch-tracked product',
      );
    }

    await this.batchDb.lockRow(params.batchId, tx);

    const batch = await this.batchDb.findById(params.batchId, tx);
    if (!batch || batch.inventoryId !== params.inventoryId) {
      throw new NotFoundException(
        `Batch with ID "${params.batchId}" not found for this inventory`,
      );
    }

    if (batch.status !== BatchStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot adjust batch with status "${batch.status}". Only ACTIVE batches can be adjusted.`,
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(batch.expiryDate) < today) {
      throw new BadRequestException('Cannot adjust an expired batch');
    }

    const newBatchQty = batch.qtyOnHand + params.quantity;
    if (newBatchQty < 0) {
      throw new BadRequestException(
        `Insufficient batch quantity. Current batch stock: ${batch.qtyOnHand}, Requested adjustment: ${params.quantity}`,
      );
    }

    return this.batchDb.update(
      batch.id,
      {
        qtyOnHand: newBatchQty,
        status: newBatchQty === 0 ? BatchStatus.DEPLETED : BatchStatus.ACTIVE,
      },
      tx,
    );
  }

  /** Updates a batch's expiry date inside a transaction after validating inventory ownership. */
  async updateBatchExpiryInTx(
    tx: Prisma.TransactionClient,
    params: { inventoryId: string; batchId: string; expiryDate: Date },
  ) {
    const batch = await this.batchDb.findById(params.batchId, tx);
    if (!batch || batch.inventoryId !== params.inventoryId) {
      throw new NotFoundException(
        `Batch with ID "${params.batchId}" not found for this inventory`,
      );
    }

    return this.batchDb.update(
      params.batchId,
      { expiryDate: params.expiryDate },
      tx,
    );
  }

  /** Adds a new batch to an existing batch-tracked inventory record (`POST /admin/batches`). */
  async create(dto: CreateBatchDto, adminId: string): Promise<IBatchDetail> {
    const expiryDate = this.parseFutureOrTodayExpiryDate(dto.expiryDate);
    const batchCode = this.generateBatchCode();

    const created = await this.batchDb.runInTransaction(async (tx) => {
      await this.inventoryDb.lockInventoryRow(dto.inventoryId, tx);

      const inventory = await this.inventoryDb.findById(dto.inventoryId, tx);
      if (!inventory) {
        throw new NotFoundException(
          `Inventory record with ID "${dto.inventoryId}" not found`,
        );
      }

      if (!inventory.product.batchTracked) {
        throw new BadRequestException(
          `Product "${inventory.product.name}" is not batch-tracked`,
        );
      }

      const batch = await this.batchDb.create(
        {
          inventoryId: inventory.id,
          batchCode,
          qtyOnHand: dto.qtyOnHand,
          expiryDate,
          status: BatchStatus.ACTIVE,
        },
        tx,
      );

      await this.inventoryDb.updateInventory(
        inventory.id,
        { qtyOnHand: inventory.qtyOnHand + dto.qtyOnHand },
        tx,
      );

      await this.inventoryDb.createTransaction(
        {
          inventoryId: inventory.id,
          type: TransactionType.RECEIVED,
          quantity: dto.qtyOnHand,
          reason: AdjustmentReason.RESTOCK,
          note: dto.note?.trim() || `Added batch ${batchCode}`,
          performedBy: adminId,
        },
        tx,
      );

      await this.inventoryDb.refreshInventoryStatus(inventory.id, tx);

      const detail = await this.batchDb.findByIdWithInventory(batch.id, tx);
      return detail!;
    });

    this.logger.log(
      `Batch ${batchCode} (+${dto.qtyOnHand}) created for "${created.inventory.product.name}" (${created.inventoryId})`,
    );

    this.auditService
      .log({
        entityType: 'BATCH',
        entityId: created.id,
        action: 'CREATE_BATCH',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          inventoryId: created.inventoryId,
          batchCode,
          qtyOnHand: dto.qtyOnHand,
          expiryDate: dto.expiryDate,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record audit log: ${(err as Error).message}`,
        );
      });

    return toBatchDetail(created);
  }

  /** Lists batches with optional product, inventory, category, status, and expiry filters. */
  async findAll(query: BatchQueryDto): Promise<IBatchListResponse> {
    if (
      query.expiryFrom &&
      query.expiryTo &&
      new Date(query.expiryFrom) > new Date(query.expiryTo)
    ) {
      throw new BadRequestException('expiryFrom cannot be later than expiryTo');
    }

    const { data, total } = await this.batchDb.findMany(query);
    const meta = buildMeta(total, query.page ?? 1, query.limit ?? 10);
    return {
      data: data.map(toBatchDetail),
      meta,
    };
  }

  /** Returns a single batch with its inventory and product summary. */
  async findOne(id: string): Promise<IBatchDetail> {
    const batch = await this.batchDb.findByIdWithInventory(id);
    if (!batch) {
      throw new NotFoundException(`Batch with ID "${id}" not found`);
    }
    return toBatchDetail(batch);
  }

  /** Updates a batch's expiry date and refreshes its parent inventory stock status. */
  async update(
    id: string,
    dto: UpdateBatchDto,
    adminId?: string,
  ): Promise<IBatchDetail> {
    const parsedExpiry = this.parseFutureOrTodayExpiryDate(dto.expiryDate);

    const existing = await this.batchDb.findByIdWithInventory(id);
    if (!existing) {
      throw new NotFoundException(`Batch with ID "${id}" not found`);
    }

    if (existing.status !== BatchStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot update expiry for batch with status "${existing.status}". Only ACTIVE batches can be updated.`,
      );
    }

    const updated = await this.batchDb.runInTransaction(async (tx) => {
      await this.batchDb.lockRow(id, tx);
      await this.batchDb.update(id, { expiryDate: parsedExpiry }, tx);
      await this.inventoryDb.refreshInventoryStatus(existing.inventoryId, tx);

      const refreshed = await this.batchDb.findByIdWithInventory(id, tx);
      return refreshed!;
    });

    this.logger.log(
      `Batch ${updated.batchCode} expiry updated to ${dto.expiryDate}`,
    );

    this.auditService
      .log({
        entityType: 'BATCH',
        entityId: updated.id,
        action: 'UPDATE_BATCH_EXPIRY',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          inventoryId: updated.inventoryId,
          batchCode: updated.batchCode,
          expiryDate: dto.expiryDate,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record audit log: ${(err as Error).message}`,
        );
      });

    return toBatchDetail(updated);
  }

  /** Marks expired active batches as `EXPIRED`, deducts stock, and refreshes stock status. */
  async processBatchExpiry(): Promise<{
    processed: number;
    expiredBatches: string[];
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredBatches = await this.batchDb.findExpiredActiveBatches(today);

    if (!expiredBatches.length) {
      return { processed: 0, expiredBatches: [] };
    }

    this.logger.log(
      `Found ${expiredBatches.length} expired active batch(es) to process`,
    );

    let processedCount = 0;
    const processedBatchCodes: string[] = [];

    for (const batch of expiredBatches) {
      try {
        const result = await this.batchDb.runInTransaction(async (tx) => {
          await this.inventoryDb.lockInventoryRow(batch.inventoryId, tx);

          const updatedCount = await this.batchDb.expireActiveBatch(
            batch.id,
            tx,
          );

          if (updatedCount === 0) {
            return null;
          }

          const inventory = await this.inventoryDb.findById(
            batch.inventoryId,
            tx,
          );
          if (!inventory) {
            return null;
          }

          const previousQty = inventory.qtyOnHand;
          const previousStatus = inventory.stockStatus;
          const deductQty = batch.qtyOnHand;

          if (deductQty > 0) {
            const newQty = Math.max(0, inventory.qtyOnHand - deductQty);
            await this.inventoryDb.updateInventory(
              batch.inventoryId,
              { qtyOnHand: newQty },
              tx,
            );

            await this.inventoryDb.createTransaction(
              {
                inventoryId: batch.inventoryId,
                type: TransactionType.ADJUSTMENT_DECREASE,
                quantity: deductQty,
                reason: null,
                note: `Batch ${batch.batchCode} expired (expiry: ${batch.expiryDate.toISOString().split('T')[0]})`,
                performedBy: AuditActorType.SYSTEM_TRIGGER,
              },
              tx,
            );
          }

          const nextStatus = await this.inventoryDb.refreshInventoryStatus(
            batch.inventoryId,
            tx,
          );

          const refreshed = await this.inventoryDb.findById(
            batch.inventoryId,
            tx,
          );

          return {
            batchId: batch.id,
            batchCode: batch.batchCode,
            inventoryId: batch.inventoryId,
            productName: inventory.product.name,
            deductQty,
            previousQty,
            newQty:
              refreshed?.qtyOnHand ?? Math.max(0, previousQty - deductQty),
            previousStatus,
            nextStatus,
          };
        });

        if (result) {
          processedCount++;
          processedBatchCodes.push(result.batchCode);

          this.logger.warn(
            `Expired batch ${result.batchCode} for "${result.productName}": deducted ${result.deductQty} unit(s) (stock ${result.previousQty} -> ${result.newQty}, status: ${result.nextStatus})`,
          );

          this.auditService
            .log({
              entityType: 'INVENTORY_BATCH',
              entityId: result.batchId,
              action: 'BATCH_EXPIRED',
              actorType: AuditActorType.SYSTEM_TRIGGER,
              details: {
                inventoryId: result.inventoryId,
                batchId: result.batchId,
                batchCode: result.batchCode,
                productName: result.productName,
                deductedQty: result.deductQty,
                previousQty: result.previousQty,
                newQty: result.newQty,
                previousStatus: result.previousStatus,
                newStatus: result.nextStatus,
              },
            })
            .catch((err) => {
              this.logger.error(
                `Failed to record audit log for expired batch: ${(err as Error).message}`,
              );
            });

          if (
            result.nextStatus !== result.previousStatus &&
            (result.nextStatus === StockStatus.LOW_STOCK ||
              result.nextStatus === StockStatus.OUT_OF_STOCK)
          ) {
            this.logger.warn(
              `Batch expiry caused stock alert: "${result.productName}" is now ${result.nextStatus}`,
            );
            this.notificationService
              .dispatchStockNotification(
                result.inventoryId,
                result.productName,
                result.nextStatus as StockStatus,
              )
              .catch((err) => {
                this.logger.error(
                  `Failed to dispatch stock notification: ${(err as Error).message}`,
                );
              });
          }
        }
      } catch (error) {
        this.logger.error(
          `Error expiring batch "${batch.batchCode}" (${batch.id}): ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }

    return {
      processed: processedCount,
      expiredBatches: processedBatchCodes,
    };
  }
}
