import { Address } from '@prisma/client';
import { AddressLabel } from '../../../common/enums';
import { IAddressResponse } from '../types';

export function toAddressResponse(address: Address): IAddressResponse {
  return {
    id: address.id,
    userId: address.userId,
    addressLine: address.addressLine,
    city: address.city,
    county: address.county,
    postcode: address.postcode,
    latitude: address.latitude ?? null,
    longitude: address.longitude ?? null,
    buildingType: address.buildingType ?? null,
    label: address.label as AddressLabel,
    isDefault: address.isDefault,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
}
