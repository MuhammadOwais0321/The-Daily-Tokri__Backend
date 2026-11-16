# 🛒 The-Daily-Tokri — Backend API & System Documentation

<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="90" alt="NestJS Logo" />
</p>

<p align="center">
  <strong>Production-Grade E-Commerce Grocery Store REST API</strong><br />
  Built with <strong>NestJS 11</strong>, <strong>Prisma ORM 7</strong>, <strong>PostgreSQL</strong>, and <strong>TypeScript</strong>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Backend-100%25%20Complete-brightgreen.svg" alt="Backend Complete" />
  <img src="https://img.shields.io/badge/NestJS-11.x-ea2845.svg" alt="NestJS" />
  <img src="https://img.shields.io/badge/Prisma-7.x-2D3748.svg" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-16+-336791.svg" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178c6.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/JWT-Authentication-black.svg" alt="JWT" />
  <img src="https://img.shields.io/badge/Security-Helmet%20%2B%20Throttler-green.svg" alt="Security" />
  <img src="https://img.shields.io/badge/E2E%20Tests-PostgreSQL%20Verified-blue.svg" alt="E2E Verified" />
</p>

---

## 📌 Project Overview

**The-Daily-Tokri** is a complete, production-ready grocery e-commerce backend REST API built with **NestJS 11**, **Prisma ORM 7**, and **PostgreSQL**. The system follows a clean layered architecture (`Controller → Service → DbService → Prisma`) with strong transactional safety, concurrency locking, role-based access control, and real-database end-to-end test coverage.

All **16 backend modules**, **5 scheduled cron jobs**, **payment & S3 abstractions**, and **real-PostgreSQL E2E workflows** are fully implemented and verified.

> **Status:** ✅ Backend 100% Completed | **Last Updated:** November 17, 2026

---

## 📊 Backend Completion Scorecard

| Area / Module | Status | Progress | Implemented Scope |
|---|:---:|:---:|---|
| **System Architecture & App Setup** | ✅ Completed | 100% | NestJS 11, global `/api/v1` prefix, `ConfigModule` fail-fast validation, `ScheduleModule`, `ThrottlerModule`, `cookie-parser`, CORS |
| **Database & Prisma Schema** | ✅ Completed | 100% | 23 models, 17 enums, PostgreSQL sequences (`order_number_seq`, `product_sku_seq`), 2 migrations, single-admin seed script |
| **Security & HTTP Hardening** | ✅ Completed | 100% | Helmet, `CustomThrottlerGuard`, global `JwtAuthGuard`, `@Roles()`, `@Public()`, `ValidationPipe`, `ErrorsExceptionFilter` |
| **Auth** (`src/modules/auth`) | ✅ Completed | 100% | Register, 6-digit OTP email verification, login (JWT + HttpOnly refresh cookie), refresh rotation, logout, password reset/change, cleanup cron |
| **User & Preferences** (`src/modules/user`) | ✅ Completed | 100% | Profile view/edit (`409` on phone conflict), stats (`avgRating`), notification preferences (`GET`/`PUT`), GDPR anonymization, admin user management |
| **Addresses** (`src/modules/addresses`) | ✅ Completed | 100% | Scoped CRUD (`404` IDOR protection), atomic single-default invariant, auto-promotion of newest address on default delete |
| **Categories** (`src/modules/category`) | ✅ Completed | 100% | 3-level hierarchy (`depth 0..2`), materialized paths & atomic subtree recalculation, max 4 featured categories, S3 image upload/delete |
| **Brands** (`src/modules/brands`) | ✅ Completed | 100% | Admin CRUD, auto-slug & uniqueness (`409`), product reference delete guard (`409`), S3 logo upload/delete |
| **Suppliers** (`src/modules/supplier`) | ✅ Completed | 100% | Admin CRUD, single-query email/phone uniqueness (`409`), product reference delete guard (`409`) |
| **Products** (`src/modules/products`) | ✅ Completed | 100% | Public/Admin visibility split, sequence SKU, leaf+active category validation, max 3 S3 images, UK allergens, reference delete guard |
| **Inventory & FEFO** (`src/modules/inventory`) | ✅ Completed | 100% | 1:1 product inventory, FEFO batch tracking, `FOR UPDATE` row locks, ledger, dynamic stock status, 5-min expiry cron |
| **Shopping Cart** (`src/modules/cart`) | ✅ Completed | 100% | `CustomerOnlyGuard`, auto get-or-create cart, live batch/stock & MOQ/max-qty validation, atomic item deletion |
| **Orders & Checkout** (`src/modules/order`) | ✅ Completed | 100% | Atomic checkout with sorted `productId` row locks, FEFO deduction, status transitions, cancellation stock restore, 1-min timeout cron |
| **Payments & Refunds** (`src/modules/payment`) | ✅ Completed | 100% | Idempotent payment initiation, `MockPaymentGateway`, HMAC-SHA256 webhook verification, auto-refunds, 5-min refund retry cron |
| **Reviews & Ratings** (`src/modules/review`) | ✅ Completed | 100% | Verified-purchase (`DELIVERED`) reviews, `isLatest` rotation, max 5 S3 images, public rating summary & breakdown, admin moderation & reply |
| **Notifications & SSE** (`src/modules/notification`) | ✅ Completed | 100% | Deduplicated DB upserts, real-time SSE stream (`/notifications/stream`) with 30s heartbeat, preference check, midnight retention cron |
| **Admin Dashboard** (`src/modules/dashboard`) | ✅ Completed | 100% | Period KPIs (`today`..`last_month`) with previous-period comparison, order & stock breakdowns, CSV export |
| **Audit Logs** (`src/modules/audit`) | ✅ Completed | 100% | Fire-and-forget `AuditService.log()`, admin query API for today's UTC logs with `entityType` & `actorType` filters |
| **Health Check** (`src/modules/health`) | ✅ Completed | 100% | Public unthrottled liveness probe (`GET /api/v1/health`) |
| **Storage, Email & E2E Tests** | ✅ Completed | 100% | `S3Service` (S3/R2 + rollback), `ImageValidationPipe`, `EmailService` (Nodemailer), real-PostgreSQL E2E workflow suite |

---

## 🚀 Implemented Modules & Features (Complete Details)

### 1. Database & Prisma ORM (`prisma/schema.prisma`, `prisma/seed.ts`)
- **23 Relational Models**: `User`, `Address`, `UserPreference`, `VerificationCode`, `Category`, `Brand`, `Supplier`, `Product`, `ProductImage`, `ProductAllergen`, `Inventory`, `InventoryBatch`, `InventoryTransaction`, `Cart`, `CartItem`, `Order`, `OrderItem`, `OrderAddress`, `Payment`, `Notification`, `Review`, `ReviewImage`, `AuditLog`.
- **17 Prisma Enums**: `UserRole`, `AddressLabel`, `StorageType`, `UnitOfMeasure`, `AllergenPresence`, `StockStatus`, `BatchStatus`, `TransactionType`, `AdjustmentReason`, `OrderStatus`, `PaymentStatus`, `PaymentMethod`, `PaymentProvider`, `DeliveryType`, `ReviewStatus`, `AuditActorType`, `VerificationType`.
- **PostgreSQL Sequences**: `product_sku_seq` (`<CAT3>-<000001>`) and `order_number_seq` (`ORD-<YEAR>-<000001>`).
- **Single-Admin Seed (`prisma/seed.ts`)**: Seeds or upgrades the single `ADMIN` user with `bcrypt` (cost 12) and default notification preferences.

### 2. Security, Auth & Infrastructure
- **Global Guards**: `CustomThrottlerGuard` (tracks by JWT `sub` or IP) and `JwtAuthGuard` (default-deny with `@Public()` opt-out, validates active user on every request, enforces `@Roles()`).
- **HTTP Hardening (`src/main.ts`)**: Helmet (`frameguard: deny`, `noSniff`, `referrerPolicy: no-referrer`, production HSTS), `cookie-parser`, CORS with credentials, global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`), and `ErrorsExceptionFilter` (`P2002` → `409`, `P2003` → `400`, `P2025` → `404`).
- **Authentication (`src/modules/auth`)**: Registration with 6-digit OTP email verification (5-attempt lockout), JWT access token (`15m`) + rotating HttpOnly refresh cookie (`7d`), password reset/change, and hourly `VerificationCleanupCron`.
- **Media & Email (`src/common/services`)**: `S3Service` for AWS S3 / Cloudflare R2 uploads with DB-failure rollback, `ImageValidationPipe` verifying magic bytes (`JPEG`, `PNG`, `WEBP`, `GIF`, max `5 MB`), and `EmailService` (Nodemailer).

### 3. User Profile, Preferences & Addresses
- **User (`src/modules/user`)**: Profile read/update (`409` on phone conflict), profile stats (`totalOrders`, `totalSpent`, `avgRating`), `GET`/`PUT /user/preferences` (push & email toggles), atomic GDPR-style self-delete (`[DELETED] <id>:<email>` anonymization preserving orders/reviews), and admin customer activation/deactivation (`400` self-change, `403` admin target).
- **Addresses (`src/modules/addresses`)**: User-scoped queries (`{ id, userId }` returning `404` on mismatch), atomic default switching in a transaction, auto-defaulting the first address, and promoting the newest remaining address when a default address is deleted.

### 4. Catalog: Categories, Brands, Suppliers & Products
- **Categories (`src/modules/category`)**: Max 3 levels (`depth 0..2`), materialized `path` (`/root/sub/leaf/`), atomic raw-SQL subtree path/depth recalculation on move/rename, `isLeaf` maintenance, circular reference & product-parent guards, max 4 top-level `bestCategory`, S3 image management.
- **Brands (`src/modules/brands`) & Suppliers (`src/modules/supplier`)**: Full admin CRUD, auto-slug & conflict checks (`409`), product-link deletion protection (`409`), and S3 brand logo upload/delete.
- **Products (`src/modules/products`)**: Leaf+active category enforcement, race-safe sequence SKU, unique slug & barcode checks, up to 3 S3 images with atomic primary image switching, UK allergens (`CONTAINS`, `MAY_CONTAIN`, `FREE_FROM`), reference delete guard (`orders`/`cart`/`inventory`), and strict public (`isActive && isVisible`) vs admin visibility separation.

### 5. Inventory, Cart & Order Lifecycle
- **Inventory (`src/modules/inventory`)**: 1:1 product inventory, `BATCH-YYYYMMDD-...` batch codes, pessimistic row locking (`SELECT ... FOR UPDATE`) on adjustments, immutable `InventoryTransaction` ledger (`RECEIVED`, `ADJUSTMENT_INCREASE`, `ADJUSTMENT_DECREASE`, `CONSUMED`, `RELEASED`), dynamic stock status (`IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`), and 5-minute `BatchExpiryCron`.
- **Cart (`src/modules/cart`)**: Restricted to customers (`CustomerOnlyGuard`), auto get-or-create cart, live non-expired batch/stock calculation, MOQ/max-qty enforcement, and atomic item removal (`0` quantity removes item).
- **Orders (`src/modules/order`)**:
  - **Checkout**: Deterministic `productId ASC` lock ordering (prevents deadlocks & overselling), `FOR UPDATE` inventory/batch locks, FEFO batch deduction, server-side price snapshot, `5-minute` payment expiration window, ledger entries, and atomic cart clearing.
  - **Fulfillment & Cancellation**: Validated admin transition map (`CONFIRMED → PROCESSING → READY_FOR_PICKUP | READY_FOR_DELIVERY → DELIVERED`), guarded `updateMany` (`409` on concurrent change), stock restoration into non-expired batches on cancellation, and 1-minute `OrderPaymentTimeoutCron`.

### 6. Payments, Webhooks & Refunds (`src/modules/payment`, `src/infrastructure/payment`)
- **Gateway Abstraction (`IPaymentGateway`)**: Decoupled business logic using `MockPaymentGateway` with HMAC-SHA256 `x-signature` verification (`timingSafeEqual`).
- **Idempotent Flows**: Reuses existing `UNPAID` payments on initiate; uses guarded `updateMany` inside transactions so duplicate `payment_intent.succeeded` or `charge.refunded` webhooks never double-credit `totalOrders` / `totalSpent` or double-refund.
- **Auto-Refunds & Retries**: Paid cancellations and late payments (`CANCELLED` → `REFUND_PENDING`) trigger post-commit gateway refunds, backed by the 5-minute `RefundRetryCron`.

### 7. Reviews, Notifications, Dashboard, Audit & Health
- **Reviews (`src/modules/review`)**: Verified-purchase enforcement (`DELIVERED` order item, one review per `orderItemId`), atomic `isLatest` flag rotation per user/product, edit resets status to `PENDING`, up to 5 S3 images, public rating summary & 1–5 star breakdown, and admin moderation/replies.
- **Notifications (`src/modules/notification`)**: Composite-key deduplicated DB upserts, real-time SSE stream (`GET /notifications/stream`) with 30-second heartbeat, user `pushNotification` preference check, admin alerts for new orders/payments/low stock/reviews, and midnight `NotificationRetentionCron`.
- **Dashboard (`src/modules/dashboard`)**: Admin KPIs (`revenue`, `totalOrders`, `paidOrders`, `averageOrderValue`, `newCustomers`) with percentage change and trend vs previous period (`today`, `yesterday`, `last_7`, `last_30`, `this_month`, `last_month`), order/inventory snapshots, and CSV download (`/admin/dashboard/export`).
- **Audit (`src/modules/audit`) & Health (`src/modules/health`)**: Non-blocking fire-and-forget `AuditService`, admin audit log queries for today's UTC window (`entityType`, `actorType`), and public unthrottled `GET /api/v1/health` liveness endpoint.

---

## ⏰ Scheduled Cron Jobs

| Cron Job | Schedule | Responsibility |
|---|---|---|
| `VerificationCleanupCron` | Every hour | Purges expired or already-used verification codes |
| `BatchExpiryCron` | Every 5 minutes | Marks past-due active batches `EXPIRED`, deducts stock, logs audit & stock alert |
| `OrderPaymentTimeoutCron` | Every minute | Auto-cancels expired unpaid `PENDING` orders and restores inventory |
| `RefundRetryCron` | Every 5 minutes | Retries gateway refunds for orders stuck in `REFUND_PENDING` |
| `NotificationRetentionCron` | Daily at midnight | Deletes notifications older than `NOTIFICATION_RETENTION_DAYS` (default `30`) |

---

## 🛡️ Rate Limits (`src/config/rate-limit.config.ts`)

| Bucket | Limit | Window |
|---|---|---|
| Global (`GLOBAL`) | `150` requests | `60s` |
| Authentication (`AUTH`) | `10` requests | `60s` |
| User / Cart / Notifications (`USER`) | `80` requests | `60s` |
| Orders (`ORDER`) | `20` requests | `60s` |
| Reviews (`REVIEW`) | `20` requests | `60s` |
| Payments (`PAYMENT`) | `5` requests | `60s` |
| Admin Write (`ADMIN_WRITE`) | `60` requests | `60s` |
| Admin Image Upload (`ADMIN_IMAGE_UPLOAD`) | `30` requests | `300s` |

---

## 🔌 API Endpoints Directory

All application routes are prefixed with `/api/v1` (except the root `GET /` check on `AppController`).

### 1. Authentication (`/api/v1/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | Register customer account and send email verification OTP |
| `POST` | `/api/v1/auth/verify-email` | Public | Verify email using 6-digit OTP (max 5 attempts) |
| `POST` | `/api/v1/auth/resend-verification` | Public | Resend email verification OTP |
| `POST` | `/api/v1/auth/login` | Public | Authenticate user; return JWT access token & set HttpOnly refresh cookie |
| `POST` | `/api/v1/auth/refresh` | Public | Rotate refresh token cookie and issue new access token |
| `POST` | `/api/v1/auth/logout` | Public | Clear refresh token cookie |
| `POST` | `/api/v1/auth/forgot-password` | Public | Request password reset OTP |
| `POST` | `/api/v1/auth/reset-password` | Public | Reset password with OTP |
| `POST` | `/api/v1/auth/change-password` | Authenticated | Change password for logged-in user |
| `GET` | `/api/v1/auth/me` | Authenticated | Get authenticated user identity |

### 2. User & Preferences (`/api/v1/user`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/user/me` | Customer / Admin | Get full user profile |
| `GET` | `/api/v1/user/me/stats` | Customer / Admin | Get `totalOrders`, `totalSpent`, and `avgRating` |
| `PUT` | `/api/v1/user` | Customer / Admin | Update `name` and/or `phone` (`409` on phone conflict) |
| `DELETE` | `/api/v1/user` | Customer | Self-delete account (atomic anonymization & data cleanup) |
| `GET` | `/api/v1/user/preferences` | Customer / Admin | Get notification preferences (auto-creates defaults if missing) |
| `PUT` | `/api/v1/user/preferences` | Customer / Admin | Upsert notification preferences (`pushNotification`, `emailNotification`) |
| `GET` | `/api/v1/user/list` | Admin | Paginated user list with search, `role`, `isActive`, `includeDeleted` |
| `PATCH` | `/api/v1/user/:id/status` | Admin | Activate or deactivate a customer account |

### 3. Addresses (`/api/v1/addresses`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/addresses` | Customer / Admin | Create address (auto-defaults first address or when `isDefault: true`) |
| `GET` | `/api/v1/addresses` | Customer / Admin | List user's saved addresses (default first) |
| `GET` | `/api/v1/addresses/:id` | Customer / Admin | Get address detail by ID |
| `PATCH` | `/api/v1/addresses/:id` | Customer / Admin | Update address fields |
| `PATCH` | `/api/v1/addresses/:id/default` | Customer / Admin | Set address as default atomically |
| `DELETE` | `/api/v1/addresses/:id` | Customer / Admin | Delete address (promotes newest remaining address if default) |

### 4. Categories (`/api/v1/categories` & `/api/v1/admin/categories`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/categories/tree` | Public | Active category hierarchy tree |
| `GET` | `/api/v1/categories/slug/:slug` | Public | Lookup active category by slug |
| `GET` | `/api/v1/categories` | Public | Paginated active categories |
| `GET` | `/api/v1/categories/:id` | Public | Active category detail |
| `GET` | `/api/v1/admin/categories/tree` | Admin | Full category tree (optional `onlyActive=true`) |
| `GET` | `/api/v1/admin/categories` | Admin | Paginated category list |
| `GET` | `/api/v1/admin/categories/:id` | Admin | Category detail |
| `POST` | `/api/v1/admin/categories` | Admin | Create category |
| `PATCH` | `/api/v1/admin/categories/:id` | Admin | Update category & re-parent subtree |
| `DELETE` | `/api/v1/admin/categories/:id` | Admin | Delete leaf category without products |
| `POST` | `/api/v1/admin/categories/:id/image` | Admin | Upload category image to S3 |
| `DELETE` | `/api/v1/admin/categories/:id/image` | Admin | Delete category image from S3 |

### 5. Brands & Suppliers (`/api/v1/admin/brands` & `/api/v1/admin/suppliers`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/brands` | Admin | Paginated brand list |
| `GET` | `/api/v1/admin/brands/:id` | Admin | Brand detail |
| `POST` | `/api/v1/admin/brands` | Admin | Create brand |
| `PATCH` | `/api/v1/admin/brands/:id` | Admin | Update brand |
| `DELETE` | `/api/v1/admin/brands/:id` | Admin | Delete brand (`409` if products linked) |
| `POST` | `/api/v1/admin/brands/:id/logo` | Admin | Upload brand logo to S3 |
| `DELETE` | `/api/v1/admin/brands/:id/logo` | Admin | Delete brand logo from S3 |
| `GET` | `/api/v1/admin/suppliers` | Admin | Paginated supplier list |
| `GET` | `/api/v1/admin/suppliers/:id` | Admin | Supplier detail |
| `POST` | `/api/v1/admin/suppliers` | Admin | Create supplier |
| `PATCH` | `/api/v1/admin/suppliers/:id` | Admin | Update supplier |
| `DELETE` | `/api/v1/admin/suppliers/:id` | Admin | Delete supplier (`409` if products linked) |

### 6. Products (`/api/v1/products` & `/api/v1/admin/products`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/products/slug/:slug` | Public | Lookup active & visible product by slug |
| `GET` | `/api/v1/products` | Public | Paginated public catalog with search, filters, allergens, and sorting |
| `GET` | `/api/v1/products/:id` | Public | Public product detail |
| `GET` | `/api/v1/admin/products` | Admin | Admin product listing (includes inactive/invisible) |
| `GET` | `/api/v1/admin/products/:id` | Admin | Full admin product detail |
| `POST` | `/api/v1/admin/products` | Admin | Create product |
| `PATCH` | `/api/v1/admin/products/:id` | Admin | Update product |
| `DELETE` | `/api/v1/admin/products/:id` | Admin | Delete product (reference guarded) |
| `POST` | `/api/v1/admin/products/:id/images` | Admin | Upload up to 3 product images |
| `PATCH` | `/api/v1/admin/products/:id/images/:imageId` | Admin | Update image metadata / primary flag |
| `DELETE` | `/api/v1/admin/products/:id/images/:imageId` | Admin | Delete product image (cannot delete sole image) |
| `GET` | `/api/v1/admin/products/:id/allergens` | Admin | List product allergens |
| `POST` | `/api/v1/admin/products/:id/allergens` | Admin | Declare product allergen |
| `DELETE` | `/api/v1/admin/products/:id/allergens/:allergenId` | Admin | Remove allergen declaration |

### 7. Inventory (`/api/v1/admin/inventory`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/inventory/available-products` | Admin | Active products without inventory records |
| `GET` | `/api/v1/admin/inventory/transactions` | Admin | Global inventory ledger |
| `GET` | `/api/v1/admin/inventory` | Admin | Paginated inventory summaries |
| `GET` | `/api/v1/admin/inventory/:id/transactions` | Admin | Ledger transactions for one inventory record |
| `GET` | `/api/v1/admin/inventory/:id` | Admin | Inventory detail with batches and recent transactions |
| `POST` | `/api/v1/admin/inventory` | Admin | Create inventory record (and initial batch if batch-tracked) |
| `POST` | `/api/v1/admin/inventory/adjustments` | Admin | Adjust stock quantity with `FOR UPDATE` locks |
| `PATCH` | `/api/v1/admin/inventory/:id` | Admin | Update `lowStockThreshold` or batch `expiryDate` |

### 8. Cart & Orders (`/api/v1/cart`, `/api/v1/orders`, `/api/v1/admin/orders`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/cart` | Customer | Get or create shopping cart |
| `POST` | `/api/v1/cart/items` | Customer | Add item or increment quantity |
| `PATCH` | `/api/v1/cart/items/:id` | Customer | Update item quantity (`0` removes item) |
| `DELETE` | `/api/v1/cart/items/:id` | Customer | Remove cart item |
| `DELETE` | `/api/v1/cart` | Customer | Clear cart |
| `POST` | `/api/v1/orders` | Customer | Checkout cart into atomic `PENDING` order |
| `GET` | `/api/v1/orders/me` | Customer | List customer's own orders |
| `GET` | `/api/v1/orders/me/:id` | Customer | Get own order detail (with batch allocations if any) |
| `PATCH` | `/api/v1/orders/me/:id/cancel` | Customer | Cancel own `PENDING` or `CONFIRMED` order |
| `GET` | `/api/v1/admin/orders` | Admin | List all orders with search and filters |
| `GET` | `/api/v1/admin/orders/:id` | Admin | Get any order detail |
| `PATCH` | `/api/v1/admin/orders/:id/status` | Admin | Advance order fulfillment status |
| `PATCH` | `/api/v1/admin/orders/:id/cancel` | Admin | Cancel pre-delivery order (queues refund if paid) |

### 9. Payments & Webhooks (`/api/v1/payments`, `/api/v1/webhooks/payments`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/payments/initiate` | Customer | Create or reuse `UNPAID` payment intent for `PENDING` order |
| `POST` | `/api/v1/payments/:id/mock-complete` | Customer | Simulate gateway success/failure for testing |
| `POST` | `/api/v1/webhooks/payments/mock` | Public (HMAC) | Signed webhook receiver (`payment_intent.succeeded`, `payment_intent.failed`, `payment_intent.canceled`, `charge.refunded`) |

### 10. Reviews (`/api/v1/reviews`, `/api/v1/admin/reviews`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/reviews/my` | Customer | List customer's own reviews |
| `GET` | `/api/v1/reviews/product/:productId` | Public | Approved latest product reviews + rating summary & breakdown |
| `POST` | `/api/v1/reviews` | Customer | Create verified-purchase review (`DELIVERED` order item) |
| `GET` | `/api/v1/reviews/:id` | Customer | Get own review detail |
| `PATCH` | `/api/v1/reviews/:id` | Customer | Edit own review (resets to `PENDING`) |
| `DELETE` | `/api/v1/reviews/:id` | Customer | Delete own review & S3 images |
| `POST` | `/api/v1/reviews/:id/images` | Customer | Upload up to 5 review images |
| `DELETE` | `/api/v1/reviews/:id/images/:imageId` | Customer | Delete review image |
| `GET` | `/api/v1/admin/reviews` | Admin | List all reviews for moderation |
| `GET` | `/api/v1/admin/reviews/:id` | Admin | Get review detail |
| `PATCH` | `/api/v1/admin/reviews/:id/status` | Admin | Moderate review (`APPROVED` / `REJECTED`) |
| `PATCH` | `/api/v1/admin/reviews/:id/reply` | Admin | Add or update admin reply |
| `DELETE` | `/api/v1/admin/reviews/:id/reply` | Admin | Remove admin reply |
| `DELETE` | `/api/v1/admin/reviews/:id` | Admin | Delete any review |

### 11. Notifications, Dashboard, Audit & Health
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/notifications/unread-count` | Customer / Admin | Unread notifications count |
| `SSE` | `/api/v1/notifications/stream` | Customer / Admin | Real-time notification stream with 30s heartbeat |
| `GET` | `/api/v1/notifications` | Customer / Admin | Paginated notifications inbox (`unreadOnly=true`) |
| `PATCH` | `/api/v1/notifications/read-all` | Customer / Admin | Mark all notifications read |
| `PATCH` | `/api/v1/notifications/:id/read` | Customer / Admin | Mark a single notification read |
| `GET` | `/api/v1/admin/dashboard` | Admin | Period KPIs, comparisons, status & inventory snapshots |
| `GET` | `/api/v1/admin/dashboard/export` | Admin | Download dashboard report as CSV |
| `GET` | `/api/v1/admin/audit-logs` | Admin | Today's UTC audit logs filtered by `entityType` & `actorType` |
| `GET` | `/api/v1/health` | Public | Liveness check (`status`, `timestamp`, `uptime`) |

---

## 🛠️ Project Structure

```text
server/
├── prisma/
│   ├── schema.prisma              # 23 models, 17 enums, relations & indexes
│   ├── seed.ts                    # Single-admin database seeder
│   └── migrations/                # PostgreSQL migration history
├── src/
│   ├── main.ts                    # Bootstrap: CORS, Helmet, CookieParser, ValidationPipe, Filter, Prefix
│   ├── app.module.ts              # Root module & global guards (CustomThrottlerGuard, JwtAuthGuard)
│   ├── app.controller.ts          # Root greeting route (GET /)
│   ├── config/
│   │   ├── env.validation.ts      # Fail-fast environment validation
│   │   └── rate-limit.config.ts   # Per-domain throttler presets
│   ├── database/                  # Global Prisma/PostgreSQL DatabaseModule & DatabaseService
│   ├── filters/
│   │   └── errors.exception.filter.ts  # Unified HTTP & Prisma error formatting
│   ├── infrastructure/
│   │   └── payment/               # IPaymentGateway contract & MockPaymentGateway
│   ├── common/
│   │   ├── date/                  # Date helpers
│   │   ├── decorators/            # @CurrentUser(), @Public(), @Roles()
│   │   ├── enums/                 # Shared domain enums
│   │   ├── guards/                # JwtAuthGuard, CustomThrottlerGuard, CustomerOnlyGuard
│   │   ├── labels/                # Domain label helpers
│   │   ├── money/                 # Money utilities
│   │   ├── pagination/            # PaginationDto & buildMeta
│   │   ├── period/                # DashboardPeriodService
│   │   ├── pipes/                 # ImageValidationPipe (magic bytes & size check)
│   │   ├── queue/                 # Queue helpers
│   │   ├── services/              # EmailService (Nodemailer), S3Service (AWS S3 / R2)
│   │   └── utils/                 # decimal, slugify, text utilities
│   └── modules/
│       ├── addresses/             # Saved customer addresses & default management
│       ├── audit/                 # Fire-and-forget AuditService & admin query API
│       ├── auth/                  # JWT auth, OTP verification & cleanup cron
│       ├── brands/                # Brand CRUD & S3 logo management
│       ├── cart/                  # Shopping cart & live stock validation
│       ├── category/              # 3-level category hierarchy & S3 image management
│       ├── dashboard/             # Admin KPIs, comparisons & CSV export
│       ├── health/                # Public liveness probe
│       ├── inventory/             # Stock control, FEFO batches, ledger & expiry cron
│       ├── notification/          # In-app notifications, SSE stream & retention cron
│       ├── order/                 # Checkout, fulfillment transitions, cancellation & timeout cron
│       ├── payment/               # Payment initiation, mock gateway webhooks & refund retry cron
│       ├── products/              # Product catalog, images, allergens & SKU generator
│       ├── review/                # Verified-purchase reviews, images & moderation
│       ├── supplier/              # Supplier CRUD
│       └── user/                  # Profile, stats, preferences, anonymization & admin user controls
├── test/
│   ├── jest-e2e.json              # Jest E2E configuration
│   ├── app.e2e-spec.ts            # App bootstrap & environment validation E2E tests
│   └── workflows.e2e-spec.ts      # Critical real-PostgreSQL end-to-end workflow tests
└── final-year-project/            # Project architecture & API specification docs
```

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```env
URL_PREFIX="v1"
PORT=4000

# Database (PostgreSQL)
DATABASE_URL="postgresql://username:password@localhost:5432/mydb?schema=public"

# JWT Secrets & Expirations (min 16 characters each)
JWT_SECRET="your-super-secret-jwt-key-min-16-chars"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-min-16-chars"
JWT_REFRESH_EXPIRES_IN="7d"

# SMTP Mail Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
EMAIL_FROM=""

# Seed Admin Account
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
ADMIN_NAME=""

# S3 / S3-Compatible Storage (optional; falls back to mock URLs if omitted)
AWS_REGION=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_S3_BUCKET=""
AWS_S3_ENDPOINT=""

# Mock Payment Webhook Secret (HMAC-SHA256)
MOCK_PAYMENT_WEBHOOK_SECRET="your-mock-payment-webhook-secret-min-32-chars"

# Notification Retention (optional, defaults to 30 days)
NOTIFICATION_RETENTION_DAYS=30
```

---

## 🏃 Running the Application

```bash
# 1. Install dependencies
npm install

# 2. Apply database migrations
npx prisma migrate dev

# 3. Seed the single admin user (requires ADMIN_EMAIL & ADMIN_PASSWORD in .env)
npm run seed

# 4. Start development server
npm run start:dev
```

The API runs at `http://localhost:4000/api/v1` (with `PORT=4000`).

### Build & Production

```bash
npm run build
npm run start:prod
```

---

## 🧪 Testing & Code Quality

```bash
# Unit tests
npm test

# End-to-End tests against isolated PostgreSQL (*_test database)
npm run test:e2e

# Lint & format
npm run lint
npm run format
```

### Real-PostgreSQL E2E Workflows (`test/workflows.e2e-spec.ts`)
1. **Full Checkout**: Register → verify email → login → add to cart → create order → `mock-complete` success → order `CONFIRMED` & `PAID`, cart cleared, stock deducted, user stats incremented.
2. **Admin Order Fulfillment**: `CONFIRMED → PROCESSING → READY_FOR_DELIVERY → DELIVERED` (including delivery-type mismatch `400` validation).
3. **Customer Paid Cancellation & Refund**: Cancel paid order → `REFUND_PENDING` → refund processed → `CANCELLED` & `REFUNDED`, stock restored, `totalOrders` & `totalSpent` decremented.
4. **Payment Timeout Cron**: Expired unpaid `PENDING` order → `OrderPaymentTimeoutCron` → `CANCELLED` (`PAYMENT_TIMEOUT`), stock restored.
5. **Oversell Race Protection**: Stock `1` with 2 parallel checkouts → 1 succeeds (`201`), 1 fails (`400`), final stock `0`.
6. **Webhook Duplicate Idempotency**: Invalid signature (`400`), duplicate `payment_intent.succeeded` deliveries (`200`) → user `totalOrders` increments only once.
7. **IDOR Protection**: Cross-customer order and address access returns `404`.
8. **Auth & RBAC Guards**: Missing token (`401`), role escalation attempt (`400`), customer on admin route (`403`), deactivated user token (`403`).
