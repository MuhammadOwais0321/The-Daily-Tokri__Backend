import { ThrottlerModuleOptions } from '@nestjs/throttler';

export const RATE_LIMIT_CONFIG = {
  GLOBAL: { limit: 150, ttl: 60000 },
  AUTH: { limit: 10, ttl: 60000 },
  USER: { limit: 80, ttl: 60000 },
  PAYMENT: { limit: 5, ttl: 60000 },
  ORDER: { limit: 20, ttl: 60000 },
  REVIEW: { limit: 20, ttl: 60000 },
  ADMIN_WRITE: { limit: 60, ttl: 60000 },
  ADMIN_IMAGE_UPLOAD: { limit: 30, ttl: 300000 },
} as const;

export const RATE_LIMITS = {
  GLOBAL: { default: RATE_LIMIT_CONFIG.GLOBAL },
  AUTH: { default: RATE_LIMIT_CONFIG.AUTH },
  USER: { default: RATE_LIMIT_CONFIG.USER },
  PAYMENT: { default: RATE_LIMIT_CONFIG.PAYMENT },
  ORDER: { default: RATE_LIMIT_CONFIG.ORDER },
  REVIEW: { default: RATE_LIMIT_CONFIG.REVIEW },
  ADMIN_WRITE: { default: RATE_LIMIT_CONFIG.ADMIN_WRITE },
  ADMIN_IMAGE_UPLOAD: { default: RATE_LIMIT_CONFIG.ADMIN_IMAGE_UPLOAD },
} as const;

export const throttlerConfig: ThrottlerModuleOptions = [
  {
    name: 'default',
    ttl: RATE_LIMIT_CONFIG.GLOBAL.ttl,
    limit: RATE_LIMIT_CONFIG.GLOBAL.limit,
  },
];
