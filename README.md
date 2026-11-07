# 🛒 The-Daily-Tokri — Backend API & System Documentation

<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="90" alt="NestJS Logo" />
</p>

<p align="center">
  <strong>Production-Grade E-Commerce Grocery Store REST API</strong><br />
  Built with <strong>NestJS 11</strong>, <strong>Prisma ORM 7</strong>, <strong>PostgreSQL</strong>, and <strong>TypeScript</strong>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11.x-ea2845.svg" alt="NestJS" />
  <img src="https://img.shields.io/badge/Prisma-7.x-2D3748.svg" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-16+-336791.svg" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178c6.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/JWT-Authentication-black.svg" alt="JWT" />
  <img src="https://img.shields.io/badge/Cookie--Parser-Refresh%20Token-orange.svg" alt="Cookie Parser" />
  <img src="https://img.shields.io/badge/Security-Helmet%20%2B%20Throttler-green.svg" alt="Security" />
  <img src="https://img.shields.io/badge/Storage-S3%20%2F%20R2-blue.svg" alt="S3 Storage" />
</p>

---

## 📌 Project Overview (Project Ka Khulasa)

**The-Daily-Tokri** ek modern grocery e-commerce platform ka backend REST API server hai. Is project ka core focus high performance, enterprise security standards, data integrity aur modular scalable architecture par hai.

Is document mein project ki **abhi tak ki mukammal progress (Current Progress Status)**, implemented features, database schema, active endpoints, aur next steps ka tafseeli record mojood hai.

> **Last Updated:** November 7, 2026

---

## 📊 Abhi Tak Ki Progress Summary (Progress Scorecard)

| Area / Module | Status | Progress | Remarks |
|---|:---:|:---:|---|
| **System Architecture & App Setup** | ✅ Completed | 100% | NestJS 11, Global Prefix `/api/v1`, ConfigModule, ScheduleModule, ThrottlerModule, CookieParser |
| **Database & Schema Design (Prisma)** | ✅ Completed | 100% | 17+ Models, Complete Enums, Relations, 2 Migrations Applied, Sequences & Checks |
| **Security & HTTP Hardening** | ✅ Completed | 100% | Helmet, Custom Throttler Guard (Rate-limiting), Global ValidationPipe, Exception Filter |
| **Authentication & Password Management** | ✅ Completed | 100% | Register, Email Verify, Login (JWT + HttpOnly Refresh Cookie), Refresh Token Rotation, Logout, Forgot/Reset Password via OTP, Change Password |
| **Email Service (Nodemailer)** | ✅ Completed | 100% | SMTP configuration, HTML OTP template, Dev mode auto-fallback |
| **Cloud Storage Engine (S3 / R2)** | ✅ Completed | 100% | S3Service (upload, best-effort delete), ImageValidationPipe (magic bytes verification) |
| **Category Hierarchy Module** | ✅ Completed | 100% | 3-level tree (depth 0..2), Materialized path calculation & recursive update (`::integer` offset), S3 image upload/delete, Re-parenting validation |
| **Product Catalog Module** | ✅ Completed | 100% | Full CRUD, SKU sequence generator, Leaf+Active category validation, S3 multi-image uploads (max 3) with atomic transactions, UK 14 Allergens, Reference deletion guard |
| **Inventory & FEFO Batches** | ✅ Completed | 100% | 1:1 product mapping, batch code generation, stock adjustments with `FOR UPDATE` locks, transaction ledger, status calculation (IN/LOW/OUT), batch expiry sweep cron (every 5m), stock alert notification dispatch |
| **Audit Logging Engine** | ✅ Completed | 100% | Fire-and-forget `AuditService` logger, persistent DB writes (`AuditDbService`), paginated audit query API |
| **Health Check API** | ✅ Completed | 100% | `/api/v1/health` with server uptime & timestamps |
| **Background Cron Tasks** | ✅ Completed | 100% | Automated cleanup cron (every 30m for verification codes) & Batch expiry sweep cron (every 5m) |
| **User & Address Management** | 🟡 Core Ready | 60% | `UserDbService` fully implemented for Auth; user address book & profile controller in progress |
| **Brands & Suppliers** | ⚙️ Scaffolded | 40% | DTOs, controllers mapped; Prisma models ready; DB service pending |
| **Notifications & Stock Alerts** | 🟡 Core Active | 60% | Admin stock alert notifications (LOW_STOCK / OUT_OF_STOCK) with deduplicated upserts; inbox controller scaffolded |
| **Cart & Order Lifecycle** | ⚙️ Scaffolded | 40% | DTOs, state machine enums ready; Controllers registered; Transactional checkout pending |
| **Payment Gateway (Mock)** | ⚙️ Scaffolded | 40% | Initiation & webhook endpoints scaffolded; Mock gateway pending |
| **Reviews & Ratings** | ⚙️ Scaffolded | 40% | DTOs, controllers and review moderation route structures in place |
| **Admin Dashboard & Analytics** | ⚙️ Scaffolded | 40% | Query DTOs, metrics & export endpoints defined |
| **Database Seed** | ⚙️ Present | —% | `prisma/seed.ts` exists; seed script configured in `package.json` |

---

## 🚀 Mukammal Implemented Features (Completed Details)

### 1. Database & Prisma ORM (`prisma/schema.prisma`)
Poore application ka relational schema PostgreSQL ke liye tayyar aur migrations apply ho chuke hain:
- **Migrations**:
  - `20261022213126_init` — Full base schema with relational constraints & cascade rules (`onDelete: Cascade` on `ProductImage` & `ProductAllergen`).
  - `20261028213500_add_verification_and_email_verified` — `VerificationCode` type enum & `isEmailVerified` field added to `User`.
- **Database Constraints & Sequences**:
  - `product_sku_seq` — Sequence for atomic, race-safe SKU generation (`<CAT3>-<000001>`).
  - Cascade deletion on images & allergens when a product is deleted.
- **Models (17+)**:
  - `User`, `Address`, `UserPreference`, `VerificationCode`, `Category`, `Brand`, `Supplier`, `Product`, `ProductImage`, `ProductAllergen`, `Inventory`, `InventoryBatch`, `InventoryTransaction`, `Cart`, `CartItem`, `Order`, `OrderItem`, `OrderAddress`, `Payment`, `Review`, `ReviewImage`, `Notification`, `AuditLog`.

---

### 2. Authentication & Authorization Module (`src/modules/auth`)
Backend khud authentication handle karta hai without any external 3rd-party auth dependencies:
- **Password Security**: Bcrypt with cost factor (salt rounds) `12` (`PasswordService`).
- **User Registration (`POST /api/v1/auth/register`)**:
  - Email uniqueness check & phone number sanitization.
  - Role assigned: `CUSTOMER`.
  - Automatic email verification OTP dispatch.
  - Fire-and-forget audit log entry.
- **Email Verification (`POST /api/v1/auth/verify-email`)**:
  - 6-digit OTP verification with 5-attempt security protection.
  - Sets `isEmailVerified: true` on user record.
- **Resend Verification (`POST /api/v1/auth/resend-verification`)**:
  - Unverified users ke liye naya OTP generate karke email karta hai.
- **User Login (`POST /api/v1/auth/login`)**:
  - Verified email aur active status check.
  - Issues short-lived **JWT access token** (15 min) in response body.
  - Sets long-lived **HttpOnly refresh token cookie** (7 days) via `cookie-parser`.
  - Updates `lastLoginAt` timestamp.
- **Token Refresh (`POST /api/v1/auth/refresh`)**:
  - Rotates refresh token (clears old cookie, sets new 7-day cookie) aur naya 15-minute access token return karta hai.
- **Logout (`POST /api/v1/auth/logout`)**:
  - Refresh token cookie clear karta hai.
- **Password Reset Flow**:
  - `POST /api/v1/auth/forgot-password` — OTP dispatch.
  - `POST /api/v1/auth/reset-password` — OTP verification & password update.
  - `POST /api/v1/auth/change-password` — Authenticated password change.
- **Profile Endpoint (`GET /api/v1/auth/me`)**:
  - Current user profile returns karta hai (excluding `passwordHash`).

---

### 3. Category Hierarchy Module (`src/modules/category`)
Full production-ready category hierarchy engine:
- **Depth Constraints**: Max depth 3 levels (`depth: 0, 1, 2`).
- **Materialized Path Traversal**: Auto-calculated paths (e.g. `/drink/cold-drink/pepsi/`).
- **Atomic Subtree Path Recalculation**: Parent category rename ya move hone par poore subtree ke descendant paths aur depths raw SQL atomic query se update hote hain (with PostgreSQL `::integer` type casting).
- **Business Integrity Rules**:
  - Category jiske paas products hon, uske neeche subcategory banana mana hai (`409 Conflict`).
  - Circular parent reference prevention (descendant category ko parent nahi banaya ja sakta).
  - Featured/Best Category limit: Maximum 4 allowed, sirf top-level (`depth: 0`) categories par.
  - Leaf category tracking: Naya child add ya delete hone par parent ka `isLeaf` boolean automatically update hota hai.
- **S3 Image Integration**: Category banner/icon image upload & replacement with automatic old image deletion.
- **Controllers**:
  - `CategoryController` (Public): Catalog tree (`/categories/tree`), slug search (`/categories/slug/:slug`), paginated active list, detail view.
  - `AdminCategoryController` (Admin): Full CRUD, image upload/delete, tree view including inactive categories.

---

### 4. Product Catalog Module (`src/modules/products`)
Enterprise-grade product catalog engine:
- **SKU Generation**: Atomic database sequence `product_sku_seq` se `<CAT3>-<000001>` format mein race-safe SKU generation.
- **Slug Generation**: Auto-generated slug format `<categorySlug>-<nameSlug>[-n]`.
- **Category Enforcement**: Product sirf **Leaf** aur **Active** category ke sath assign ho sakta hai (`ensureLeafAndActive`).
- **Input & Business Constraints**:
  - `maximumOrderQuantity >= minimumOrderQuantity` validation.
  - Per-category product name uniqueness (`@@unique([name, categoryId])`).
  - Global barcode uniqueness check.
- **Multi-Image S3 Asset Management**:
  - Maximum 3 images per product, sort order `0..2`.
  - Exactly one primary image enforcement.
  - `updateImage`: Primary image change hone par purani primary ko clear karna aur naye ko primary set karna **atomic transaction (`runInTransaction`)** mein wrap hai.
  - `deleteImage`: Agar product ke paas sirf 1 image bachi ho to delete blocked hai; primary image delete hone par remaining image automatically primary ban jati hai (`runInTransaction` ke andar); S3 file deletion DB commit ke **baad** chalti hai.
- **UK Allergen Declarations**: 14 UK allergen types track karne ka support (`CONTAINS`, `MAY_CONTAIN`, `FREE_FROM`).
- **Safe Deletion Guard**:
  - Product delete karte waqt orders, carts, ya active inventory references check hote hain (`hasReferences`). Agar reference ho to delete block ho kar `409 Conflict` throw hota hai.
  - Relational image aur allergen records automatically DB level par cascade delete hote hain (`onDelete: Cascade`).
  - S3 images DB delete successful hone ke baad best-effort cleanup hoti hain.
- **Public vs Admin Visibility**:
  - Public routes (`/products`, `/products/:id`, `/products/slug/:slug`) backend level par strictly `isActive: true` aur `isVisible: true` filter enforce karti hain.
  - Admin routes (`/admin/products`) inactive/invisible products aur audit tracking provide karti hain.

---

### 5. Inventory & FEFO Batches Engine (`src/modules/inventory`)
Enterprise stock tracking, FEFO batch lifecycle, aur transactional ledger engine:
- **Product-to-Inventory Mapping**:
  - Exactly 1:1 relation between `Product` and `Inventory` (`@@unique([productId])`).
  - Available products discovery endpoint (`GET /admin/inventory/available-products`) to list products ready for inventory creation.
- **Batch Code Generation & FEFO Lifecycle**:
  - Unique batch code generation pattern: `BATCH-YYYYMMDD-XXXXXXXXXXXX`.
  - Batch-tracked products ke liye future expiry date validation; non-batch products par batch payload reject.
  - Batches `expiryDate ASC` order mein manage hote hain (FEFO principle).
- **Transactional Stock Adjustments (`POST /admin/inventory/adjustments`)**:
  - `runInTransaction` ke andar pessimistic row locks (`SELECT ... FOR UPDATE`) se race-condition safe updates.
  - Supports `ADJUSTMENT_INCREASE` aur `ADJUSTMENT_DECREASE` with reasons (`DAMAGE`, `RECOUNT`, `RETURN_TO_SUPPLIER`, `MANUAL_CORRECTION`, `RESTOCK`).
  - Automatic double safety against negative stock (application logic + PostgreSQL CHECK constraint).
- **Transaction Ledger (`InventoryTransaction`)**:
  - Har movement ka granular audit trail (`RECEIVED`, `ADJUSTMENT_INCREASE`, `ADJUSTMENT_DECREASE`).
  - Queryable global ledger (`GET /admin/inventory/transactions`) aur per-inventory ledger (`GET /admin/inventory/:id/transactions`).
- **Dynamic Stock Status Auto-Refresh**:
  - Formula: active, non-expired batches ka aggregate (batch-tracked ke liye) ya `qtyOnHand` (non-batch ke liye).
  - Transitions: `> lowStockThreshold` → `IN_STOCK`, `<= lowStockThreshold` → `LOW_STOCK`, `<= 0` → `OUT_OF_STOCK`.
- **Automated Batch Expiry Sweep Cron (`BatchExpiryCron`)**:
  - Scheduled to run every 5 minutes (`@Cron(CronExpression.EVERY_5_MINUTES)`).
  - Past-date active batches ko atomically `EXPIRED` mark karta hai.
  - Stock deduct karke `ADJUSTMENT_DECREASE` ledger entry create karta hai with `performedBy: AuditActorType.SYSTEM_TRIGGER`.
  - Fire-and-forget audit log dispatch karta hai (`actorType: AuditActorType.SYSTEM_TRIGGER`).
  - Status change par admins ko notification alerts bhejta hai.
- **Stock Alert Notifications**:
  - `NotificationService.dispatchStockNotification` active store admins ko `LOW_STOCK` aur `OUT_OF_STOCK` alert notifications bhejta hai with deduplicated composite upserts (`userId`, `referenceId`, `referenceEvent`).
- **Module Architecture Consolidation**:
  - Purane scaffolded `batchs` module ki tamam functionality ko cleanly `inventory` module ke andar consolidate kar diya gaya hai.

---

### 6. Audit Logging Engine (`src/modules/audit`)
- **Fire-and-Forget Architecture**: `AuditService.log()` main user requests ko block ya fail kiye baghair background mein database persistence execute karta hai.
- **Database Storage**: Tamam actions `audit_logs` table mein JSON structured details ke sath record hote hain.
- **Admin Audit API (`GET /api/v1/audit`)**:
  - Filter by `entityType` (PRODUCT, CATEGORY, USER, ORDER, etc.).
  - Filter by `actorType` (USER, ADMIN, SYSTEM_TRIGGER).
  - Date range filtering (`dateFrom`, `dateTo`).
  - Standard pagination with metadata (`page`, `limit`, `total`, `pages`).

---

### 7. Cloud Storage & Media Validation (`src/common/services/s3.service.ts`)
- Cloudflare R2 / AWS S3 S3-compatible object storage support.
- **`ImageValidationPipe`**: Magic bytes (file signature) check jo spoofed extensions ko block karta hai (sirf JPEG, PNG, WEBP, ICO allow).
- Max 5 MB image size limit.

---

### 8. Application Security & Infrastructure
- **Global Helmet Protection**: Strict security headers (`frameguard: deny`, `noSniff: true`, `referrerPolicy: no-referrer`, production HSTS).
- **Cookie Parser**: Middleware for HttpOnly refresh token extraction.
- **Global JWT Auth Guard (`JwtAuthGuard`)**: Default deny architecture with `@Public()` decorator opt-out.
- **Rate Limiting (`CustomThrottlerGuard`)**:
  - Auth routes: 5 req/min.
  - Orders/Payments: strict throttle buckets.
- **Global Validation Pipe**: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` ensuring mass assignment protection.
- **Global Exception Filter (`ErrorsExceptionFilter`)**: Standardized error response structure, Prisma exception translation (`P2002` → 409, `P2025` → 404, `P2003` → 400), internal stack traces hidden from clients.

---

## 🔌 API Endpoints Directory (Endpoints Ki List)

### 1. Authentication (`/api/v1/auth`)
| Method | Endpoint | Access | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | 5 req / min | New user account creation & sends verification OTP |
| `POST` | `/api/v1/auth/verify-email` | Public | 5 req / min | Verifies email via 6-digit OTP (5 attempts max) |
| `POST` | `/api/v1/auth/resend-verification` | Public | 5 req / min | Resends verification OTP to email |
| `POST` | `/api/v1/auth/login` | Public | 5 req / min | Login; returns JWT access token & sets HttpOnly refresh token cookie |
| `POST` | `/api/v1/auth/refresh` | Public | 5 req / min | Rotates refresh token & returns new access token |
| `POST` | `/api/v1/auth/logout` | Public | Default | Clears refresh token cookie and logs out |
| `POST` | `/api/v1/auth/forgot-password` | Public | 5 req / min | Requests OTP via email for password reset |
| `POST` | `/api/v1/auth/reset-password` | Public | 5 req / min | Resets password using OTP code |
| `POST` | `/api/v1/auth/change-password` | Authenticated | 5 req / min | Updates user password (requires current password) |
| `GET` | `/api/v1/auth/me` | Authenticated | Default | Retrieves current authenticated user profile |

### 2. Categories — Public Catalog (`/api/v1/categories`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/categories/tree` | Public | Returns complete active category hierarchy tree |
| `GET` | `/api/v1/categories/slug/:slug` | Public | Lookup active category details by slug |
| `GET` | `/api/v1/categories` | Public | Paginated list with filters (`search`, `bestCategory`, `parentId`, `depth`, `isLeaf`) |
| `GET` | `/api/v1/categories/:id` | Public | Get active category details by UUID |

### 3. Categories — Admin Management (`/api/v1/admin/categories`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/categories/tree` | Admin | Full hierarchy tree (includes inactive categories) |
| `GET` | `/api/v1/admin/categories` | Admin | Paginated list of all categories with full filter support |
| `GET` | `/api/v1/admin/categories/:id` | Admin | Get category detail by UUID |
| `POST` | `/api/v1/admin/categories` | Admin | Create category (auto slug, path, depth, leaf updates) |
| `PATCH` | `/api/v1/admin/categories/:id` | Admin | Update category (re-parenting, path recalculation, best category) |
| `DELETE` | `/api/v1/admin/categories/:id` | Admin | Delete category (blocked if child categories or products exist) |
| `POST` | `/api/v1/admin/categories/:id/image`| Admin | Upload category image to S3 (magic bytes verified) |
| `DELETE`| `/api/v1/admin/categories/:id/image`| Admin | Delete category image from S3 and database |

### 4. Products — Public Catalog (`/api/v1/products`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/products/slug/:slug` | Public | Lookup active and visible product by slug |
| `GET` | `/api/v1/products` | Public | Paginated catalog with filters (`q`, `categoryId`, `minPrice`, `maxPrice`, `storageType`, `batchTracked`, `allergens`, `sortBy`, `sortOrder`) |
| `GET` | `/api/v1/products/:id` | Public | Get active and visible product details by UUID |

### 5. Products — Admin Management (`/api/v1/admin/products`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/products` | Admin | List all products with filters (includes inactive/invisible) |
| `GET` | `/api/v1/admin/products/:id` | Admin | Product detail by UUID |
| `POST` | `/api/v1/admin/products` | Admin | Create product (auto SKU via sequence, slug, leaf category verification) |
| `PATCH` | `/api/v1/admin/products/:id` | Admin | Update product details |
| `DELETE` | `/api/v1/admin/products/:id` | Admin | Delete product (reference check guard, cascade images/allergens, S3 cleanup) |
| `POST` | `/api/v1/admin/products/:id/images` | Admin | Upload images (multipart/form-data, max 3, magic bytes checked) |
| `PATCH` | `/api/v1/admin/products/:productId/images/:imageId` | Admin | Update image sortOrder or primary status (atomic transaction) |
| `DELETE` | `/api/v1/admin/products/:productId/images/:imageId` | Admin | Delete image (single-image protection, auto-promotes remaining image to primary, S3 delete post-commit) |
| `GET` | `/api/v1/admin/products/:id/allergens` | Admin | List declared allergens for product |
| `POST` | `/api/v1/admin/products/:id/allergens` | Admin | Declare allergen (`CONTAINS`, `MAY_CONTAIN`, `FREE_FROM`) |
| `DELETE`| `/api/v1/admin/products/:productId/allergens/:allergenId` | Admin | Remove declared allergen |

### 6. Inventory & Batches — Admin Management (`/api/v1/admin/inventory`)
| Method | Endpoint | Access | Rate Limit | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/inventory/available-products` | Admin | Default | List active products without an inventory record |
| `GET` | `/api/v1/admin/inventory/transactions` | Admin | Default | Query global inventory transaction ledger (`q`, `productId`, `inventoryId`, `type`, `dateFrom`, `dateTo`) |
| `GET` | `/api/v1/admin/inventory` | Admin | Default | Paginated inventory list (`search`, `stockStatus`, `page`, `limit`) |
| `GET` | `/api/v1/admin/inventory/:id` | Admin | Default | Get inventory detail by UUID (includes batch & product info) |
| `GET` | `/api/v1/admin/inventory/:id/transactions` | Admin | Default | Paginated transactions for a specific inventory record |
| `POST` | `/api/v1/admin/inventory` | Admin | 60 req / min | Create inventory record (+ initial batch if batch-tracked) |
| `POST` | `/api/v1/admin/inventory/adjustments` | Admin | 60 req / min | Adjust stock quantity with reason and note (`FOR UPDATE` row lock) |
| `PATCH` | `/api/v1/admin/inventory/:id` | Admin | 60 req / min | Update `lowStockThreshold` or batch expiry date |

### 7. Audit Logs (`/api/v1/audit`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/audit` | Admin | List system audit logs (`entityType`, `actorType`, `dateFrom`, `dateTo`, pagination) |

### 8. Health Check (`/api/v1/health`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Returns server health status, uptime, and timestamp |

---

## 🛠️ Project Architecture & Folder Structure

```text
server/
├── prisma/
│   ├── schema.prisma              # Database models, relations & cascade definitions
│   ├── seed.ts                    # Database seeder script
│   └── migrations/                # PostgreSQL migration history
├── src/
│   ├── main.ts                    # Bootstrap: Helmet, CookieParser, ValidationPipe, Filters, Prefix
│   ├── app.module.ts              # Root module wiring all feature modules
│   ├── config/
│   │   ├── env.validation.ts      # Class-validator environment rules (fail-fast)
│   │   └── rate-limit.config.ts   # Throttler configuration constants
│   ├── database/
│   │   ├── database.service.ts    # PrismaClient lifecycle management
│   │   └── database.module.ts     # Global DatabaseModule
│   ├── common/
│   │   ├── decorators/            # @CurrentUser(), @Public(), @Roles()
│   │   ├── guards/                # JwtAuthGuard, CustomThrottlerGuard, CustomerOnlyGuard
│   │   ├── filters/               # ErrorsExceptionFilter (unified error formats + Prisma error mapping)
│   │   ├── pipes/                 # ImageValidationPipe (magic bytes / file-type checks)
│   │   ├── services/              # EmailService (SMTP), S3Service (Cloudflare R2 / S3 storage)
│   │   ├── money/                 # Money utilities (toDecimalString)
│   │   ├── pagination/            # Reusable pagination helpers (buildMeta, PaginationDto)
│   │   ├── utils/                 # decimal, slugify, text normalization utilities
│   │   └── enums/                 # Application-wide domain enums
│   └── modules/
│       ├── auth/                  # ✅ Auth engine: JWT, refresh tokens, OTP, email verify, cleanup cron
│       ├── category/              # ✅ Full 3-level Category Hierarchy (Public & Admin controllers)
│       │   ├── mappers/           # Category response mappers
│       │   ├── types/             # Filter contracts & payload types
│       │   └── ...
│       ├── products/              # ✅ Complete Product Engine (Public & Admin controllers)
│       │   ├── mappers/           # Product response & summary mappers
│       │   ├── types/             # Product payload & response contracts
│       │   └── ...
│       ├── inventory/             # ✅ Full Stock Control, FEFO batches, ledger & 5-min expiry cron
│       │   ├── cron/              # BatchExpiryCron (@Cron every 5 minutes)
│       │   ├── mappers/           # Inventory & transaction response mappers
│       │   ├── types/             # Inventory payload & response contracts
│       │   └── ...
│       ├── audit/                 # ✅ Audit logger & DB query persistence
│       ├── health/                # ✅ Health check monitoring endpoint
│       ├── notification/          # 🟡 Admin stock alert notifications (LOW/OUT of stock); inbox scaffolded
│       ├── user/                  # 🟡 UserDbService (complete), Address & profile management in progress
│       ├── brands/                # ⚙️ Scaffolded — brand management
│       ├── supplier/              # ⚙️ Scaffolded — supplier management
│       ├── cart/                  # ⚙️ Scaffolded — shopping cart
│       ├── order/                 # ⚙️ Scaffolded — order state machine
│       ├── payment/               # ⚙️ Scaffolded — mock payment gateway & callbacks
│       ├── review/                # ⚙️ Scaffolded — product reviews & moderation
│       ├── dashboard/             # ⚙️ Scaffolded — admin analytics & CSV export
│       └── events/                # ⚙️ Scaffolded — SSE event streams
└── final-year-project/            # Detailed reference guides & specifications (docs)
```

---

## ⚙️ Environment Variables Setup (`.env`)

Root directory mein `.env` file create karein (`.env.example` ke mutabiq):

```env
# Application Prefix & Port
URL_PREFIX=""
PORT=4000

# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://username:password@localhost:5432/thedailytokri?schema=public"

# JWT Secret & Expiration
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="15m"

# Refresh Token Secret & Expiration
REFRESH_TOKEN_SECRET="your-refresh-token-secret"
REFRESH_TOKEN_EXPIRES_IN="7d"

# S3 / Cloudflare R2 Storage Configuration
S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
S3_REGION="auto"
S3_ACCESS_KEY_ID="your-access-key-id"
S3_SECRET_ACCESS_KEY="your-secret-access-key"
S3_BUCKET="your-bucket-name"
S3_PUBLIC_URL="https://your-public-cdn-domain.com"

# SMTP Mail Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
EMAIL_FROM="The-Daily-Tokri <noreply@thedailytokri.com>"
```

---

## 🏃 Running the Application

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Database Migrations
```bash
npx prisma migrate dev
```

### 3. (Optional) Seed the Database
```bash
npm run seed
```

### 4. Start Development Server
```bash
npm run start:dev
```
Application starts at: `http://localhost:4000/api/v1`

### 5. Build for Production
```bash
npm run build
npm run start:prod
```

---

## 🎯 Next Implementation Roadmap (Agli Manzil)

Project acceptance roadmap ke mutabiq aglay marhalay:

1. **User Address Book & Profile Management**:
   - User profile edit aur address book CRUD operations.
   - Ek user ka single default address constraint transaction mein enforce karna.
   - GDPR-style account anonymization (`[DELETED]` email prefix, cascade data cleanup).

2. **Brands & Suppliers CRUD**:
   - `BrandDbService` aur `SupplierDbService` mein Prisma CRUD queries aur logo upload wire karna.

3. **Cart Operations**:
   - Customer-only guard (`CustomerOnlyGuard`) enforce karna.
   - Add/update karte waqt inventory stock check validate karna.
   - Real-time cart calculations (totals, item counts).

4. **Order State Machine & Checkout**:
   - Order creation par deterministic sorted row locks (`SELECT ... FOR UPDATE`) se overselling aur deadlock prevent karna.
   - Atomic order transaction: stock deduction, CONSUMED ledger entry, aur cart cleanup.
   - Order lifecycle transitions (`PENDING` → `CONFIRMED` → `PROCESSING` → `DELIVERED`).
   - Order cancellation par stock restore karna (`RELEASED`).
   - 5-minute unpaid payment timeout auto-cancellation cron.

5. **Payment Gateway (Mock)**:
   - Order checkout intent create karna.
   - Mock payment webhook handler (HMAC signature verification).
   - Late payment auto-refund flow aur refund retry cron.

6. **Reviews & Ratings**:
   - Sirf delivered orders ke verified purchases par review submit karne ki ijazat.
   - Admin moderation flow (`APPROVED`, `REJECTED`).
