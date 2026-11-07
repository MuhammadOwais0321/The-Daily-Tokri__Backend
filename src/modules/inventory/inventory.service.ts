import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InventoryDbService } from './inventory.db.service';
import { ProductsDbService } from '../products/products.db.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import {
  CreateInventoryDto,
  InventoryAdjustmentDto,
  InventoryQueryDto,
  InventoryTransactionsQueryDto,
  UpdateInventoryDto,
} from './dto';
import {
  IAvailableProductListResponse,
  IInventoryListResponse,
  IInventoryResponse,
  ITransactionListResponse,
} from './types';
import {
  toAvailableProduct,
  toInventoryResponse,
  toInventorySummary,
  toInventoryTransaction,
} from './mappers';
import {
  AdjustmentReason,
  BatchStatus,
  StockStatus,
  TransactionType,
} from '@prisma/client';
import { AuditActorType } from '../../common/enums';
import { buildMeta, PaginationDto } from '../../common/pagination';
import * as crypto from 'crypto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryDb: InventoryDbService,
    private readonly productsDb: ProductsDbService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Helper to format current date as YYYYMMDD
   */
  private formatYearMonthDay(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  /**
   * Generates a unique batch code in format BATCH-YYYYMMDD-XXXXXXXXXXXX
   */
  private generateBatchCode(): string {
    const dateStr = this.formatYearMonthDay(new Date());
    const randHex = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `BATCH-${dateStr}-${randHex}`;
  }

  /**
   * Creates an inventory record for a product.
   * Enforces 1:1 product to inventory mapping, validates batch requirements,
   * creates initial batch if batchTracked, and logs an initial RECEIVED transaction.
   */
  async create(
    dto: CreateInventoryDto,
    adminId: string,
  ): Promise<IInventoryResponse> {
    const product = await this.productsDb.findById(dto.productId);
    if (!product) {
      throw new NotFoundException(
        `Product with ID "${dto.productId}" not found`,
      );
    }

    const existing = await this.inventoryDb.findByProductId(dto.productId);
    if (existing) {
      throw new ConflictException(
        `Inventory record already exists for product "${product.name}"`,
      );
    }

    let expiryDate: Date | undefined;
    if (product.batchTracked) {
      if (!dto.batch?.expiryDate) {
        throw new BadRequestException(
          'Batch expiry date is required for a batch-tracked product',
        );
      }
      expiryDate = new Date(dto.batch.expiryDate);
      if (isNaN(expiryDate.getTime())) {
        throw new BadRequestException('Invalid batch expiry date provided');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expiryDate < today) {
        throw new BadRequestException(
          'Expiry date must be today or a future date',
        );
      }
    } else if (dto.batch) {
      throw new BadRequestException(
        'Batch details cannot be provided for a non-batch-tracked product',
      );
    }

    const initialQty = dto.qtyOnHand ?? 0;
    const threshold = dto.lowStockThreshold ?? 10;

    const created = await this.inventoryDb.runInTransaction(async (tx) => {
      const inventory = await this.inventoryDb.createInventory(
        {
          productId: dto.productId,
          qtyOnHand: initialQty,
          lowStockThreshold: threshold,
          stockStatus: StockStatus.IN_STOCK,
        },
        tx,
      );

      if (product.batchTracked && expiryDate) {
        const batchCode = this.generateBatchCode();
        await this.inventoryDb.createBatch(
          {
            inventoryId: inventory.id,
            batchCode,
            qtyOnHand: initialQty,
            expiryDate,
            status: BatchStatus.ACTIVE,
          },
          tx,
        );
      }

      if (initialQty > 0) {
        await this.inventoryDb.createTransaction(
          {
            inventoryId: inventory.id,
            type: TransactionType.RECEIVED,
            quantity: initialQty,
            reason: AdjustmentReason.RESTOCK,
            note: 'Initial inventory intake',
            performedBy: adminId 
          },
          tx,
        );
      }

      await this.inventoryDb.refreshInventoryStatus(inventory.id, tx);

      const refreshed = await this.inventoryDb.findById(inventory.id, tx);
      return refreshed!;
    });

    this.logger.log(
      `Inventory created for product "${product.name}" (${product.id}) with initial quantity ${initialQty}`,
    );

    this.auditService
      .log({
        entityType: 'INVENTORY',
        entityId: created.id,
        action: 'CREATE_INVENTORY',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          productId: dto.productId,
          productName: product.name,
          qtyOnHand: initialQty,
          lowStockThreshold: threshold,
          stockStatus: created.stockStatus,
          batchTracked: product.batchTracked,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record audit log: ${(err as Error).message}`,
        );
      });

    if (
      created.stockStatus === StockStatus.LOW_STOCK ||
      created.stockStatus === StockStatus.OUT_OF_STOCK
    ) {
      this.logger.warn(
        `Product "${product.name}" inventory created with ${created.stockStatus} status`,
      );
      this.notificationService
        .dispatchStockNotification(
          created.id,
          product.name,
          created.stockStatus 
        )
        .catch((err) => {
          this.logger.error(
            `Failed to dispatch stock notification: ${(err as Error).message}`,
          );
        });
    }

    return toInventoryResponse(created);
  }

  /**
   * Adjusts stock quantity for an inventory row (and corresponding batch if batch-tracked).
   * Runs in an interactive transaction with row-level locks (SELECT ... FOR UPDATE).
   */
  async adjust(
    dto: InventoryAdjustmentDto,
    adminId?: string,
  ): Promise<IInventoryResponse> {
    if (dto.quantity === 0) {
      throw new BadRequestException('Adjustment quantity cannot be zero');
    }

    if (
      (dto.reason === AdjustmentReason.DAMAGE ||
        dto.reason === AdjustmentReason.RETURN_TO_SUPPLIER) &&
      dto.quantity > 0
    ) {
      throw new BadRequestException(
        `Adjustment reason "${dto.reason}" requires a negative quantity`,
      );
    }

    const updated = await this.inventoryDb.runInTransaction(async (tx) => {
      // 1. Lock the inventory row
      await this.inventoryDb.lockInventoryRow(dto.inventoryId, tx);

      const inventory = await this.inventoryDb.findById(dto.inventoryId, tx);
      if (!inventory) {
        throw new NotFoundException(
          `Inventory record with ID "${dto.inventoryId}" not found`,
        );
      }

      const isBatchTracked = inventory.product.batchTracked;

      // 2. If batch-tracked, require and lock the batch
      if (isBatchTracked) {
        if (!dto.batchId) {
          throw new BadRequestException(
            'Batch ID is required for adjusting inventory of a batch-tracked product',
          );
        }

        await this.inventoryDb.lockBatchRow(dto.batchId, tx);

        const batch = await this.inventoryDb.findBatchById(dto.batchId, tx);
        if (!batch || batch.inventoryId !== inventory.id) {
          throw new NotFoundException(
            `Batch with ID "${dto.batchId}" not found for this inventory`,
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

        const newBatchQty = batch.qtyOnHand + dto.quantity;
        if (newBatchQty < 0) {
          throw new BadRequestException(
            `Insufficient batch quantity. Current batch stock: ${batch.qtyOnHand}, Requested adjustment: ${dto.quantity}`,
          );
        }

        await this.inventoryDb.updateBatch(
          batch.id,
          {
            qtyOnHand: newBatchQty,
            status:
              newBatchQty === 0 ? BatchStatus.DEPLETED : BatchStatus.ACTIVE,
          },
          tx,
        );
      }

      // 3. Check and update inventory qtyOnHand
      const newInventoryQty = inventory.qtyOnHand + dto.quantity;
      if (newInventoryQty < 0) {
        throw new BadRequestException(
          `Insufficient inventory quantity. Current on-hand stock: ${inventory.qtyOnHand}, Requested adjustment: ${dto.quantity}`,
        );
      }

      await this.inventoryDb.updateInventory(
        inventory.id,
        { qtyOnHand: newInventoryQty },
        tx,
      );

      // 4. Record the inventory transaction
      const txnType =
        dto.quantity > 0
          ? TransactionType.ADJUSTMENT_INCREASE
          : TransactionType.ADJUSTMENT_DECREASE;

      await this.inventoryDb.createTransaction(
        {
          inventoryId: inventory.id,
          type: txnType,
          quantity: Math.abs(dto.quantity),
          reason: dto.reason,
          note: dto.note || null,
          performedBy: adminId || 'ADMIN',
        },
        tx,
      );

      // 5. Refresh stock status
      await this.inventoryDb.refreshInventoryStatus(inventory.id, tx);

      const refreshed = await this.inventoryDb.findById(inventory.id, tx);
      return {
        refreshed: refreshed!,
        previousQty: inventory.qtyOnHand,
        previousStatus: inventory.stockStatus,
      };
    });

    this.logger.log(
      `Inventory adjusted for "${updated.refreshed.product.name}" (${updated.refreshed.id}): ` +
        `${dto.quantity > 0 ? '+' : ''}${dto.quantity} (${dto.reason}). New stock: ${updated.refreshed.qtyOnHand}`,
    );

    this.auditService
      .log({
        entityType: 'INVENTORY',
        entityId: updated.refreshed.id,
        action: 'ADJUST_INVENTORY',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          inventoryId: updated.refreshed.id,
          productId: updated.refreshed.productId,
          productName: updated.refreshed.product.name,
          quantity: dto.quantity,
          reason: dto.reason,
          batchId: dto.batchId,
          note: dto.note,
          previousQty: updated.previousQty,
          newQty: updated.refreshed.qtyOnHand,
          previousStockStatus: updated.previousStatus,
          newStockStatus: updated.refreshed.stockStatus,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record audit log: ${(err as Error).message}`,
        );
      });

    if (
      updated.refreshed.stockStatus !== updated.previousStatus &&
      (updated.refreshed.stockStatus === StockStatus.LOW_STOCK ||
        updated.refreshed.stockStatus === StockStatus.OUT_OF_STOCK)
    ) {
      this.logger.warn(
        `Stock status alert: "${updated.refreshed.product.name}" is now ${updated.refreshed.stockStatus} (on-hand: ${updated.refreshed.qtyOnHand})`,
      );
      this.notificationService
        .dispatchStockNotification(
          updated.refreshed.id,
          updated.refreshed.product.name,
          updated.refreshed.stockStatus as StockStatus,
        )
        .catch((err) => {
          this.logger.error(
            `Failed to dispatch stock notification: ${(err as Error).message}`,
          );
        });
    }

    return toInventoryResponse(updated.refreshed);
  }

  /**
   * Updates inventory parameters: lowStockThreshold or batch expiry date.
   */
  async update(
    id: string,
    dto: UpdateInventoryDto,
    adminId?: string,
  ): Promise<IInventoryResponse> {
    const existing = await this.inventoryDb.findById(id);
    if (!existing) {
      throw new NotFoundException(`Inventory with ID "${id}" not found`);
    }

    let parsedExpiry: Date | undefined;
    if (dto.batchId || dto.expiryDate) {
      if (!dto.batchId || !dto.expiryDate) {
        throw new BadRequestException(
          'Both batchId and expiryDate must be provided to update batch expiry',
        );
      }

      parsedExpiry = new Date(dto.expiryDate);
      if (isNaN(parsedExpiry.getTime())) {
        throw new BadRequestException('Invalid batch expiry date provided');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsedExpiry < today) {
        throw new BadRequestException(
          'Expiry date must be today or a future date',
        );
      }

      const batch = await this.inventoryDb.findBatchById(dto.batchId);
      if (!batch || batch.inventoryId !== id) {
        throw new NotFoundException(
          `Batch with ID "${dto.batchId}" not found for this inventory`,
        );
      }
    }

    const updated = await this.inventoryDb.runInTransaction(async (tx) => {
      if (dto.batchId && parsedExpiry) {
        await this.inventoryDb.updateBatch(
          dto.batchId,
          { expiryDate: parsedExpiry },
          tx,
        );
      }

      if (dto.lowStockThreshold !== undefined) {
        await this.inventoryDb.updateInventory(
          id,
          { lowStockThreshold: dto.lowStockThreshold },
          tx,
        );
      }

      await this.inventoryDb.refreshInventoryStatus(id, tx);

      const refreshed = await this.inventoryDb.findById(id, tx);
      return refreshed!;
    });

    this.logger.log(
      `Inventory updated for "${updated.product.name}" (${updated.id})`,
    );

    this.auditService
      .log({
        entityType: 'INVENTORY',
        entityId: updated.id,
        action: 'UPDATE_INVENTORY',
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details: {
          lowStockThreshold: dto.lowStockThreshold,
          batchId: dto.batchId,
          expiryDate: dto.expiryDate,
        },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to record audit log: ${(err as Error).message}`,
        );
      });

    if (
      updated.stockStatus !== existing.stockStatus &&
      (updated.stockStatus === StockStatus.LOW_STOCK ||
        updated.stockStatus === StockStatus.OUT_OF_STOCK)
    ) {
      this.notificationService
        .dispatchStockNotification(
          updated.id,
          updated.product.name,
          updated.stockStatus
        )
        .catch((err) => {
          this.logger.error(
            `Failed to dispatch stock notification: ${(err as Error).message}`,
          );
        });
    }

    return toInventoryResponse(updated);
  }

  /**
   * Returns a paginated list of inventory summaries with search and status filters.
   */
  async findAll(query: InventoryQueryDto): Promise<IInventoryListResponse> {
    const { data, total } = await this.inventoryDb.findMany(query);
    const summaries = data.map(toInventorySummary);
    const meta = buildMeta(total, query.page ?? 1, query.limit ?? 10);
    return { data: summaries, meta };
  }

  /**
   * Returns complete inventory details by inventory ID.
   */
  async findOne(id: string): Promise<IInventoryResponse> {
    const inventory = await this.inventoryDb.findById(id);
    if (!inventory) {
      throw new NotFoundException(`Inventory with ID "${id}" not found`);
    }
    return toInventoryResponse(inventory);
  }

  /**
   * Returns active products that do not have an inventory row yet.
   */
  async findAvailableProducts(
    query: PaginationDto,
  ): Promise<IAvailableProductListResponse> {
    const { data, total } = await this.inventoryDb.findAvailableProducts(
      query.page,
      query.limit,
    );
    const products = data.map(toAvailableProduct);
    const meta = buildMeta(total, query.page ?? 1, query.limit ?? 10);
    return { data: products, meta };
  }

  /**
   * Returns paginated audit transactions across inventory records.
   */
  async findTransactions(
    query: InventoryTransactionsQueryDto,
  ): Promise<ITransactionListResponse> {
    const { data, total } = await this.inventoryDb.findTransactions(query);
    const transactions = data.map(toInventoryTransaction);
    const meta = buildMeta(total, query.page ?? 1, query.limit ?? 10);
    return { data: transactions, meta };
  }

  /**
   * Returns paginated transactions specifically for one inventory record.
   */
  async findTransactionsByInventoryId(
    inventoryId: string,
    query: PaginationDto,
  ): Promise<ITransactionListResponse> {
    const inventory = await this.inventoryDb.findById(inventoryId);
    if (!inventory) {
      throw new NotFoundException(
        `Inventory with ID "${inventoryId}" not found`,
      );
    }

    const { data, total } =
      await this.inventoryDb.findTransactionsByInventoryId(
        inventoryId,
        query.page,
        query.limit,
      );
    const transactions = data.map(toInventoryTransaction);
    const meta = buildMeta(total, query.page ?? 1, query.limit ?? 10);
    return { data: transactions, meta };
  }

  /**
   * Sweeps expired ACTIVE batches (expiryDate < today), marks them EXPIRED,
   * deducts inventory on-hand stock, records ADJUSTMENT_DECREASE ledger transaction,
   * and refreshes stock status in an interactive transaction with row locks.
   * Guarded updates ensure duplicate/concurrent cron executions are safe and idempotent.
   */
  async processBatchExpiry(): Promise<{
    processed: number;
    expiredBatches: string[];
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredBatches =
      await this.inventoryDb.findExpiredActiveBatches(today);

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
        const result = await this.inventoryDb.runInTransaction(async (tx) => {
          // 1. Lock the inventory row to avoid concurrency races with checkout / adjustments
          await this.inventoryDb.lockInventoryRow(batch.inventoryId, tx);

          // 2. Guarded update: only mark EXPIRED if status is still ACTIVE
          const updatedCount = await this.inventoryDb.expireActiveBatch(
            batch.id,
            tx,
          );

          if (updatedCount === 0) {
            // Concurrently handled by another worker / transaction
            return null;
          }

          // 3. Retrieve current inventory on-hand qty
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

          // 4. Deduct quantity if batch had stock on hand
          if (deductQty > 0) {
            const newQty = Math.max(0, inventory.qtyOnHand - deductQty);
            await this.inventoryDb.updateInventory(
              batch.inventoryId,
              { qtyOnHand: newQty },
              tx,
            );

            // 5. Create ADJUSTMENT_DECREASE ledger transaction
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

          // 6. Refresh stock status
          const nextStatus = await this.inventoryDb.refreshInventoryStatus(
            batch.inventoryId,
            tx,
          );

          const refreshed = await this.inventoryDb.findById(
            batch.inventoryId,
            tx,
          );

          return {
            inventoryId: batch.inventoryId,
            batchId: batch.id,
            batchCode: batch.batchCode,
            productName: inventory.product.name,
            deductQty,
            previousQty,
            newQty: refreshed
              ? refreshed.qtyOnHand
              : Math.max(0, inventory.qtyOnHand - deductQty),
            previousStatus,
            nextStatus,
          };
        });

        if (result) {
          processedCount++;
          processedBatchCodes.push(result.batchCode);

          this.logger.log(
            `Batch "${result.batchCode}" for "${result.productName}" expired: deducted ${result.deductQty} units. New stock: ${result.newQty} (${result.nextStatus})`,
          );

          // Fire-and-forget audit log after transaction commit
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

          // Stock alert notification if status transitioned to LOW_STOCK or OUT_OF_STOCK
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
