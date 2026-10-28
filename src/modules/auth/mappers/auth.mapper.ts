import { User } from '@prisma/client';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
}

/**
 * Strips anonymized prefix from deleted user emails according to Section 6 of 01-business-logic.md
 * e.g. "[DELETED] <id>:john@example.com" -> "john@example.com"
 */
export function stripDeletedEmailPrefix(email: string): string {
  if (!email) return email;
  const match = email.match(/^\[DELETED\]\s*(?:[^:]+:)?(.*)$/);
  return match && match[1] ? match[1].trim() : email;
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: stripDeletedEmailPrefix(user.email),
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
  };
}
