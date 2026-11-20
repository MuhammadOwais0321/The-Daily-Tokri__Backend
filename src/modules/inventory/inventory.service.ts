import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InventoryDbService } from './inventory.db.service';
import { ProductsDbService } from '../products/products.db.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { BatchService } from '../batch/batch.service';
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
  AuditActorType,
  StockStatus,
  TransactionType,
} from '@prisma/client';
import { buildMeta, PaginationDto } from '../../common/pagination';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryDb: InventoryDbService,
    private readonly productsDb: ProductsDbService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => BatchService))
    private readonly batchService: BatchService,
  ) {}

  /** Creates inventory record and initial batch if batch-tracked */
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
      expiryDate = this.batchService.parseFutureOrTodayExpiryDate(
        dto.batch.expiryDate,
      );
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
        await this.batchService.createInitialBatchInTx(tx, {
          inventoryId: inventory.id,
          qtyOnHand: initialQty,
          expiryDate,
        });
      }

      if (initialQty > 0) {
        await this.inventoryDb.createTransaction(
          {
            inventoryId: inventory.id,
            type: TransactionType.RECEIVED,
            quantity: initialQty,
            reason: AdjustmentReason.RESTOCK,
            note: 'Initial inventory intake',
            performedBy: adminId,
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
          created.stockStatus,
        )
        .catch((err) => {
          this.logger.error(
            `Failed to dispatch stock notification: ${(err as Error).message}`,
          );
        });
    }

    return toInventoryResponse(created);
  }

  /** Adjusts stock quantity with pessimistic row locks */
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
      await this.inventoryDb.lockInventoryRow(dto.inventoryId, tx);

      const inventory = await this.inventoryDb.findById(dto.inventoryId, tx);
      if (!inventory) {
        throw new NotFoundException(
          `Inventory record with ID "${dto.inventoryId}" not found`,
        );
      }

      const isBatchTracked = inventory.product.batchTracked;

      if (isBatchTracked) {
        await this.batchService.adjustBatchInTx(tx, {
          inventoryId: inventory.id,
          batchId: dto.batchId,
          quantity: dto.quantity,
        });
      }

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

  /** Updates `lowStockThreshold` or batch expiry date. */
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

      parsedExpiry = this.batchService.parseFutureOrTodayExpiryDate(
        dto.expiryDate,
      );
    }

    const updated = await this.inventoryDb.runInTransaction(async (tx) => {
      if (dto.batchId && parsedExpiry) {
        await this.batchService.updateBatchExpiryInTx(tx, {
          inventoryId: id,
          batchId: dto.batchId,
          expiryDate: parsedExpiry,
        });
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
          updated.stockStatus,
        )
        .catch((err) => {
          this.logger.error(
            `Failed to dispatch stock notification: ${(err as Error).message}`,
          );
        });
    }

    return toInventoryResponse(updated);
  }

  /** Returns a paginated list of inventory summaries. */
  async findAll(query: InventoryQueryDto): Promise<IInventoryListResponse> {
    const { data, total } = await this.inventoryDb.findMany(query);
    const summaries = data.map(toInventorySummary);
    const meta = buildMeta(total, query.page ?? 1, query.limit ?? 10);
    return { data: summaries, meta };
  }

  /** Returns inventory details by ID. */
  async findOne(id: string): Promise<IInventoryResponse> {
    const inventory = await this.inventoryDb.findById(id);
    if (!inventory) {
      throw new NotFoundException(`Inventory with ID "${id}" not found`);
    }
    return toInventoryResponse(inventory);
  }

  /** Returns active products that do not yet have an inventory record. */
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

  /** Returns paginated inventory ledger transactions. */
  async findTransactions(
    query: InventoryTransactionsQueryDto,
  ): Promise<ITransactionListResponse> {
    const { data, total } = await this.inventoryDb.findTransactions(query);
    const transactions = data.map(toInventoryTransaction);
    const meta = buildMeta(total, query.page ?? 1, query.limit ?? 10);
    return { data: transactions, meta };
  }

  /** Returns paginated ledger transactions for a single inventory record. */
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
}
