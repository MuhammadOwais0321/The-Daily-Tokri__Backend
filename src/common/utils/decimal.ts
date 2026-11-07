import { Prisma } from '@prisma/client';

export function toDecimalString(
  value: Prisma.Decimal | number | string | null | undefined,
): string {
  if (value === null || value === undefined) {
    return '0.00';
  }
  if (value instanceof Prisma.Decimal) {
    return value.toFixed(2);
  }
  return new Prisma.Decimal(value).toFixed(2);
}
