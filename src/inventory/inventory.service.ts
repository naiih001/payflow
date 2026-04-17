import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inventory, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  InventoryReservationItemInput,
  InventoryReservationResult,
} from './interfaces/inventory-reservation.interface';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

const TRANSACTION_RETRY_LIMIT = 3;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureInventoryRecord(productId: string, quantity = 0) {
    return this.prisma.inventory.upsert({
      where: {
        productId,
      },
      update: {},
      create: {
        productId,
        quantity,
      },
    });
  }

  async findByProductIdOrFail(productId: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { productId },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    return inventory;
  }

  async setQuantity(productId: string, quantity: number) {
    const inventory = await this.findByProductIdOrFail(productId);
    if (inventory.reserved > quantity) {
      throw new ConflictException(
        'Quantity cannot be lower than the currently reserved stock',
      );
    }

    return this.prisma.inventory.update({
      where: { productId },
      data: { quantity },
    });
  }

  async reserve(
    items: InventoryReservationItemInput[],
  ): Promise<InventoryReservationResult[]> {
    return this.runSerializableTransaction((tx) =>
      this.reserveInTransaction(tx, items),
    );
  }

  async confirmReservation(
    items: InventoryReservationItemInput[],
  ): Promise<InventoryReservationResult[]> {
    return this.runSerializableTransaction((tx) =>
      this.confirmReservationInTransaction(tx, items),
    );
  }

  async releaseReservation(
    items: InventoryReservationItemInput[],
  ): Promise<InventoryReservationResult[]> {
    return this.runSerializableTransaction((tx) =>
      this.releaseReservationInTransaction(tx, items),
    );
  }

  private async reserveInTransaction(
    tx: TransactionClient,
    items: InventoryReservationItemInput[],
  ): Promise<InventoryReservationResult[]> {
    const normalizedItems = this.normalizeItems(items);
    const results: InventoryReservationResult[] = [];

    for (const item of normalizedItems) {
      const inventory = await tx.inventory.findUnique({
        where: { productId: item.productId },
      });

      if (!inventory) {
        throw new NotFoundException(
          `Inventory record not found for product ${item.productId}`,
        );
      }

      const available = inventory.quantity - inventory.reserved;
      if (available < item.quantity) {
        throw new ConflictException(
          `Insufficient stock for product ${item.productId}`,
        );
      }

      const updatedInventory = await tx.inventory.update({
        where: { productId: item.productId },
        data: {
          reserved: inventory.reserved + item.quantity,
        },
      });

      results.push(this.toReservationResult(updatedInventory, item.quantity));
    }

    return results;
  }

  private async confirmReservationInTransaction(
    tx: TransactionClient,
    items: InventoryReservationItemInput[],
  ): Promise<InventoryReservationResult[]> {
    const normalizedItems = this.normalizeItems(items);
    const results: InventoryReservationResult[] = [];

    for (const item of normalizedItems) {
      const inventory = await tx.inventory.findUnique({
        where: { productId: item.productId },
      });

      if (!inventory) {
        throw new NotFoundException(
          `Inventory record not found for product ${item.productId}`,
        );
      }

      if (inventory.reserved < item.quantity) {
        throw new ConflictException(
          `Cannot confirm more reserved stock than exists for product ${item.productId}`,
        );
      }

      const updatedInventory = await tx.inventory.update({
        where: { productId: item.productId },
        data: {
          quantity: inventory.quantity - item.quantity,
          reserved: inventory.reserved - item.quantity,
        },
      });

      results.push(this.toReservationResult(updatedInventory, item.quantity));
    }

    return results;
  }

  private async releaseReservationInTransaction(
    tx: TransactionClient,
    items: InventoryReservationItemInput[],
  ): Promise<InventoryReservationResult[]> {
    const normalizedItems = this.normalizeItems(items);
    const results: InventoryReservationResult[] = [];

    for (const item of normalizedItems) {
      const inventory = await tx.inventory.findUnique({
        where: { productId: item.productId },
      });

      if (!inventory) {
        throw new NotFoundException(
          `Inventory record not found for product ${item.productId}`,
        );
      }

      if (inventory.reserved < item.quantity) {
        throw new ConflictException(
          `Cannot release more reserved stock than exists for product ${item.productId}`,
        );
      }

      const updatedInventory = await tx.inventory.update({
        where: { productId: item.productId },
        data: {
          reserved: inventory.reserved - item.quantity,
        },
      });

      results.push(this.toReservationResult(updatedInventory, item.quantity));
    }

    return results;
  }

  private normalizeItems(items: InventoryReservationItemInput[]) {
    if (items.length === 0) {
      throw new ConflictException('At least one inventory item is required');
    }

    const mergedItems = new Map<string, number>();

    for (const item of items) {
      if (!item.productId || !Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new ConflictException('Each inventory item requires a valid productId and quantity');
      }

      mergedItems.set(
        item.productId,
        (mergedItems.get(item.productId) ?? 0) + item.quantity,
      );
    }

    return Array.from(mergedItems.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
  }

  private toReservationResult(
    inventory: Inventory,
    quantity: number,
  ): InventoryReservationResult {
    return {
      productId: inventory.productId,
      quantity,
      reserved: inventory.reserved,
      available: inventory.quantity - inventory.reserved,
    };
  }

  private async runSerializableTransaction<T>(
    operation: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= TRANSACTION_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => operation(tx as TransactionClient),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < TRANSACTION_RETRY_LIMIT
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException('Inventory transaction could not be completed');
  }
}
