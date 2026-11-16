import { ISupplier, SupplierWithRelations } from '../types';

export function toSupplierResponse(supplier: SupplierWithRelations): ISupplier {
  return {
    id: supplier.id,
    name: supplier.name,
    email: supplier.email,
    phone: supplier.phone,
    contactPerson: supplier.contactPerson ?? null,
    address: supplier.address ?? null,
    isActive: supplier.isActive,
    productCount: supplier._count?.products ?? 0,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
  };
}
