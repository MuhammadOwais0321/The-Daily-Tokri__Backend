import { AddressLabel } from '../../../common/enums';

export interface IAddressResponse {
  id: string;
  userId: string;
  addressLine: string;
  city: string;
  county: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  buildingType: string | null;
  label: AddressLabel;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
