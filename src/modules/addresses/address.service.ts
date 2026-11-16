import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AddressDbService } from './address.db.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';
import { IAddressResponse } from './types';
import { toAddressResponse } from './mappers';
import { AddressLabel } from '../../common/enums';

@Injectable()
export class AddressService {
  private readonly logger = new Logger(AddressService.name);

  constructor(private readonly addressDb: AddressDbService) {}

  /** Creates an address and marks it as default if it is the user's first or `isDefault` is true. */
  async create(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<IAddressResponse> {
    return this.addressDb.runInTransaction(async (tx) => {
      const count = await this.addressDb.countByUserId(userId, tx);
      const shouldBeDefault = count === 0 || dto.isDefault === true;

      if (shouldBeDefault) {
        await this.addressDb.unsetDefaultsForUser(userId, tx);
      }

      const created = await this.addressDb.create(
        {
          userId,
          addressLine: dto.addressLine.trim(),
          city: dto.city.trim(),
          county: dto.county.trim(),
          postcode: dto.postcode.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          buildingType: dto.buildingType?.trim() || null,
          label: dto.label ?? AddressLabel.HOME,
          isDefault: shouldBeDefault,
        },
        tx,
      );

      this.logger.log(
        `Address created: ${created.id} for user ${userId} (default: ${shouldBeDefault})`,
      );

      return toAddressResponse(created);
    });
  }

  /** Lists all addresses for the authenticated user (default first). */
  async findAll(userId: string): Promise<IAddressResponse[]> {
    const addresses = await this.addressDb.findManyByUserId(userId);
    return addresses.map(toAddressResponse);
  }

  /** Retrieves an address scoped to `{ id, userId }` (returns 404 if not owned). */
  async findOne(id: string, userId: string): Promise<IAddressResponse> {
    const address = await this.addressDb.findByIdAndUserId(id, userId);
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return toAddressResponse(address);
  }

  /** Updates an address and rotates the default flag atomically when changed. */
  async update(
    id: string,
    userId: string,
    dto: UpdateAddressDto,
  ): Promise<IAddressResponse> {
    const existing = await this.addressDb.findByIdAndUserId(id, userId);
    if (!existing) {
      throw new NotFoundException('Address not found');
    }

    return this.addressDb.runInTransaction(async (tx) => {
      let willBeDefault = existing.isDefault;
      let promoteNewestOtherId: string | null = null;

      if (dto.isDefault === true && !existing.isDefault) {
        await this.addressDb.unsetDefaultsForUser(userId, tx);
        willBeDefault = true;
      } else if (dto.isDefault === false && existing.isDefault) {
        const newestOther = await this.addressDb.findNewestByUserId(
          userId,
          id,
          tx,
        );
        if (newestOther) {
          willBeDefault = false;
          promoteNewestOtherId = newestOther.id;
        } else {
          // If this is the user's only address, it must remain default
          willBeDefault = true;
        }
      }

      const updated = await this.addressDb.update(
        id,
        userId,
        {
          ...(dto.addressLine !== undefined
            ? { addressLine: dto.addressLine.trim() }
            : {}),
          ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
          ...(dto.county !== undefined ? { county: dto.county.trim() } : {}),
          ...(dto.postcode !== undefined
            ? { postcode: dto.postcode.trim() }
            : {}),
          ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
          ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
          ...(dto.buildingType !== undefined
            ? { buildingType: dto.buildingType?.trim() || null }
            : {}),
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: willBeDefault } : {}),
        },
        tx,
      );

      // Once the current default address is set to false, promote the other address safely
      if (promoteNewestOtherId) {
        await this.addressDb.update(
          promoteNewestOtherId,
          userId,
          { isDefault: true },
          tx,
        );
      }

      this.logger.log(`Address ${id} updated for user ${userId}`);

      return toAddressResponse(updated);
    });
  }

  /** Deletes an address and promotes the newest remaining address if the deleted one was default. */
  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.addressDb.findByIdAndUserId(id, userId);
    if (!existing) {
      throw new NotFoundException('Address not found');
    }

    await this.addressDb.runInTransaction(async (tx) => {
      await this.addressDb.delete(id, userId, tx);

      if (existing.isDefault) {
        const newest = await this.addressDb.findNewestByUserId(userId, id, tx);
        if (newest) {
          await this.addressDb.update(
            newest.id,
            userId,
            { isDefault: true },
            tx,
          );
          this.logger.log(
            `Promoted newest address ${newest.id} to default for user ${userId}`,
          );
        }
      }
    });

    this.logger.log(`Address ${id} deleted for user ${userId}`);
  }

  /** Marks an address as the user's default address (idempotent). */
  async setDefault(id: string, userId: string): Promise<IAddressResponse> {
    const target = await this.addressDb.findByIdAndUserId(id, userId);
    if (!target) {
      throw new NotFoundException('Address not found');
    }

    if (target.isDefault) {
      return toAddressResponse(target);
    }

    return this.addressDb.runInTransaction(async (tx) => {
      await this.addressDb.unsetDefaultsForUser(userId, tx);
      const updated = await this.addressDb.update(
        id,
        userId,
        { isDefault: true },
        tx,
      );

      this.logger.log(`Address ${id} marked as default for user ${userId}`);

      return toAddressResponse(updated);
    });
  }
}
