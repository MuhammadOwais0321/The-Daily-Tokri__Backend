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
</p>

---

## 📌 Project Overview (Project Ka Khulasa)

**The-Daily-Tokri** ek modern grocery e-commerce platform ka backend API server hai. Is project ka core focus high performance, enterprise security standards, data integrity aur modular scalable architecture par hai.

Is document mein project ki **abhi tak ki mukammal progress (Current Progress Status)**, implemented features, database schema, active endpoints, aur next steps ka tafseeli record mojood hai.

> **Last Updated:** October 29, 2026

---

## 📊 Abhi Tak Ki Progress Summary (Progress Scorecard)

| Area / Module | Status | Progress | Remarks |
|---|:---:|:---:|---|
| **System Architecture & App Setup** | ✅ Completed | 100% | NestJS 11, Global Prefix `/api/v1`, ConfigModule, ScheduleModule, ThrottlerModule, CookieParser |
| **Database & Schema Design (Prisma)** | ✅ Completed | 100% | 17+ Models, Complete Enums, Relations, 2 Migrations Applied |
| **Security & HTTP Hardening** | ✅ Completed | 100% | Helmet, Custom Throttler Guard (Rate-limiting), Global ValidationPipe, Exception Filter |
| **Authentication & Password Management** | ✅ Completed | 100% | Register, Email Verify, Login (JWT + HttpOnly Refresh Cookie), Refresh Token Rotation, Logout, Forgot/Reset Password via OTP, Change Password |
| **Email Service (Nodemailer)** | ✅ Completed | 100% | SMTP configuration, HTML OTP template, Dev mode auto-fallback |
| **Background Cron Tasks** | ✅ Completed | 100% | Automated cleanup cron running every 30 minutes for expired verification codes |
| **Audit Logging Engine** | 🟡 Active Foundation | 75% | `AuditService` fire-and-forget logger active; DB persistence (`AuditDbService`) scaffolded |
| **Health Check API** | ✅ Completed | 100% | `/api/v1/health` with server uptime & timestamps |
| **User & Profile Management** | 🟡 Core Ready | 60% | `UserDbService` fully implemented for Auth; `UserService` controller & DTOs scaffolded |
| **Catalog (Categories, Brands, Suppliers)** | ⚙️ Scaffolded | 40% | DTOs, Controllers, `*.db.service.ts` structured; Prisma models ready; business logic pending |
| **Products & Inventory / Batches** | ⚙️ Scaffolded | 40% | Full Prisma schema, DTOs, controllers mapped; Business logic pending |
| **Cart & Order Lifecycle** | ⚙️ Scaffolded | 40% | DTOs, state machine enums ready; Controllers registered |
| **Payment Gateway (Mock)** | ⚙️ Scaffolded | 40% | Webhook DTOs & initiation endpoints scaffolded |
| **Reviews, Notifications & Events** | ⚙️ Scaffolded | 40% | DTOs, controllers and SSE route structures in place |
| **Admin Dashboard & Analytics** | ⚙️ Scaffolded | 40% | Query DTOs, metrics & export endpoints defined |
| **Database Seed** | ⚙️ Present | —% | `prisma/seed.ts` exists; seed script configured in `package.json` |

---

## 🚀 Mukammal Implemented Features (Completed Details)

### 1. Database & Prisma ORM (`prisma/schema.prisma`)
Poore application ka relational schema PostgreSQL ke liye tayyar aur 2 migrations apply ho chuke hain:
- **Migrations**:
  - `20261022213126_init` — Full base schema.
  - `20261028213500_add_verification_and_email_verified` — `VerificationCode` type enum & `isEmailVerified` field added to `User`.
- **Models (17+)**:
  - `User`: Email, PasswordHash, Phone, UserRole (ADMIN, CUSTOMER), `isEmailVerified`, `lastLoginAt`, order statistics.
  - `Address`: Addresses with labels (HOME, WORK, OTHER) and coordinates.
  - `UserPreference`: Push & Email notification toggles.
  - `VerificationCode`: OTP storage with `VerificationType` enum (`EMAIL_VERIFICATION`, `PASSWORD_RESET`), expiry & usage status.
  - `Category`: Self-referencing hierarchical structure (`parentId`, `depth`, `path`, `isLeaf`).
  - `Brand` & `Supplier`: Vendor aur brand data models.
  - `Product`, `ProductImage`, `ProductAllergen`: Products with multi-image ordering, storage conditions (`StorageType`), allergens (`AllergenPresence`), and units of measure (`UnitOfMeasure`).
  - `Inventory`, `InventoryBatch`, `InventoryTransaction`: Real-time stock counts (`StockStatus`), FEFO batch tracking (`BatchStatus`), and transaction ledger (`TransactionType`, `AdjustmentReason`).
  - `Cart` & `CartItem`: Persistent shopping carts.
  - `Order`, `OrderItem`, `OrderAddress`: Orders with detailed lifecycle states (`PENDING`, `CONFIRMED`, `PROCESSING`, `READY_FOR_PICKUP`, `DELIVERED`, `CANCELLED`).
  - `Payment`: Gateway references, payment status (`UNPAID`, `PAID`, `REFUNDED`), method & provider.
  - `Review` & `ReviewImage`: Product reviews with ratings and admin moderation status.
  - `Notification`: User notifications with read/unread tracking.
  - `AuditLog`: System-wide audit trail with JSON payload details.

### 2. Authentication & Authorization Module (`src/modules/auth`)
Backend khud authentication handle karta hai without any external 3rd-party auth dependencies:
- **Password Security**: Bcrypt with cost factor (salt rounds) `12` (`PasswordService`).
- **User Registration (`POST /api/v1/auth/register`)**:
  - Email uniqueness check.
  - Phone sanitization (empty/whitespace converted to null to protect DB unique constraint).
  - Default role assigned: `CUSTOMER`.
  - Sends email verification OTP immediately after registration.
  - Auto-logs action in Audit Service.
- **Email Verification (`POST /api/v1/auth/verify-email`)**:
  - 6-digit OTP verification with 5-attempt security protection.
  - Sets `isEmailVerified: true` on the User record.
- **Resend Verification (`POST /api/v1/auth/resend-verification`)**:
  - Allows unverified users to request a new OTP.
- **User Login (`POST /api/v1/auth/login`)**:
  - Requires email to be verified (`isEmailVerified: true`).
  - Validates active user status (`isActive: true`).
  - Bcrypt password verification.
  - Issues short-lived **JWT access token** (15 min) in response body.
  - Sets long-lived **HttpOnly refresh token cookie** (7 days) via `cookie-parser`.
  - Updates `lastLoginAt` in the database.
- **Token Refresh (`POST /api/v1/auth/refresh`)**:
  - Reads refresh token from HttpOnly cookie or request body.
  - Rotates refresh token: clears old cookie, issues new 7-day HttpOnly cookie.
  - Returns new 15-minute access token.
- **Logout (`POST /api/v1/auth/logout`)**:
  - Clears the HttpOnly refresh token cookie.
- **Forgot Password (`POST /api/v1/auth/forgot-password`)**:
  - Generates secure 6-digit numeric OTP.
  - Stores code in DB with a 15-minute expiration window (`VerificationType.PASSWORD_RESET`).
  - Sends email via `EmailService`.
- **Reset Password (`POST /api/v1/auth/reset-password`)**:
  - Verifies OTP code and checks expiry.
  - Hashes new password and updates user profile.
  - Marks OTP code as used / deletes old codes.
- **Change Password (`POST /api/v1/auth/change-password`)**:
  - Requires JWT authentication.
  - Validates current password before applying the new password.
- **Current User Profile (`GET /api/v1/auth/me`)**:
  - Returns authenticated user details sanitized via `toSafeUser` (excluding `passwordHash`).
- **Automated Verification Code Cleanup Cron**:
  - Runs every 30 minutes via `@nestjs/schedule` (`VerificationCleanupCron`) to delete expired or used verification codes from PostgreSQL.

### 3. Application Security & Infrastructure
- **Global Helmet Protection**: Configured with strict headers (`frameguard: deny`, `noSniff: true`, `referrerPolicy: no-referrer`, and production HSTS).
- **Cookie Parser (`cookie-parser`)**: Middleware registered to parse HttpOnly cookies for refresh token rotation.
- **Global JWT Authentication Guard (`JwtAuthGuard`)**:
  - Applied globally via `APP_GUARD`.
  - Supports `@Public()` decorator for public endpoints.
  - Injects typed `request.user` into requests.
- **Rate Limiting & Throttling (`CustomThrottlerGuard`)**:
  - Powered by `@nestjs/throttler`.
  - Custom IP resolution with proxy support (`x-forwarded-for`).
  - Auth endpoints restricted to 5 requests / minute.
- **Global Input Validation Pipe**:
  - `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true` ensuring malformed payload protection.
- **Global Exception Filter (`ErrorsExceptionFilter`)**:
  - Intercepts all exceptions across the entire application.
  - Formats standard JSON responses (`{ statusCode, message, error }`).
  - Automatic Prisma error translation (e.g., `P2002` Unique Constraint → 409 Conflict, `P2025` Not Found → 404, `P2003` → 400).
- **Environment Validation (`src/config/env.validation.ts`)**:
  - Fail-fast environment loading using `class-validator`. Server will not start if required env variables are missing or invalid.

### 4. Email Notification Engine (`src/common/services/email.service.ts`)
- Nodemailer SMTP transporter integration.
- Responsive HTML template for both email verification & password reset OTP delivery.
- **Dev Mode Fallback**: Agar SMTP credentials configure na hon toh server crash karne ke bajaye console par code log karta hai:
  `[DEV MODE] Verification code for user@example.com: 123456`.

### 5. Health Monitoring Module (`src/modules/health`)
- `GET /api/v1/health`: Server availability, uptime, aur ISO timestamp return karta hai.

### 6. Database Seed (`prisma/seed.ts`)
- `npm run seed` — Initial seed data populate karne ke liye script present hai.

---

## 🔌 API Endpoints Directory (Endpoints Ki List)

### Authentication (`/api/v1/auth`)
| Method | Endpoint | Access | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | 5 req / min | New user account creation & sends email verification OTP |
| `POST` | `/api/v1/auth/verify-email` | Public | 5 req / min | Verifies email via 6-digit OTP (5-attempt security protection) |
| `POST` | `/api/v1/auth/resend-verification` | Public | 5 req / min | Resends verification OTP to email |
| `POST` | `/api/v1/auth/login` | Public | 5 req / min | User login; returns JWT access token & sets HttpOnly refresh token cookie (requires verified email) |
| `POST` | `/api/v1/auth/refresh` | Public | 5 req / min | Rotates refresh token (clears old cookie, sets new 7d cookie) & returns new 15m access token |
| `POST` | `/api/v1/auth/logout` | Public | Default | Clears refresh token cookie and logs out |
| `POST` | `/api/v1/auth/forgot-password` | Public | 5 req / min | Requests 6-digit OTP via email for password reset |
| `POST` | `/api/v1/auth/reset-password` | Public | 5 req / min | Resets password using OTP code |
| `POST` | `/api/v1/auth/change-password` | Authenticated | 5 req / min | Updates user password (requires current password) |
| `GET` | `/api/v1/auth/me` | Authenticated | Default | Retrieves current authenticated user profile |

### Health Check (`/api/v1/health`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Returns service health status and uptime |

### Scaffolded Commerce Modules (Ready for Business Logic)
The controllers, routes, and DTOs for the following modules are fully wired into `AppModule`. Business logic implementation is pending:

| Module | Route Prefix | Endpoints Available |
|---|---|---|
| **Users** | `/api/v1/user` | `POST /`, `GET /`, `GET /:id`, `PUT /profile`, `DELETE /:id` |
| **Categories** | `/api/v1/category` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| **Brands** | `/api/v1/brands` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| **Suppliers** | `/api/v1/supplier` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| **Products** | `/api/v1/products` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| **Inventory** | `/api/v1/inventory` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| **Batches** | `/api/v1/batchs` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id` |
| **Cart** | `/api/v1/cart` | `GET /`, `POST /items`, `PUT /items/:id`, `DELETE /items/:id`, `DELETE /` |
| **Orders** | `/api/v1/order` | `POST /`, `GET /`, `GET /:id`, `DELETE /:id` |
| **Payments** | `/api/v1/payment` | `POST /initiate`, `GET /`, `GET /:id`, `DELETE /:id` |
| **Reviews** | `/api/v1/review` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| **Notifications** | `/api/v1/notification` | `POST /`, `GET /`, `GET /:id`, `DELETE /:id` |
| **Dashboard** | `/api/v1/dashboard` | `GET /`, `GET /export` |
| **Events** | `/api/v1/events` | `GET /`, `GET /:id`, `DELETE /:id` |
| **Audit** | `/api/v1/audit` | `GET /` |

---

## 🛠️ Project Architecture & Folder Structure

```text
server/
├── prisma/
│   ├── schema.prisma              # Database models, relations & enums
│   ├── seed.ts                    # Database seeder script
│   └── migrations/                # PostgreSQL migration history (2 applied)
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
│   │   ├── services/              # EmailService (Nodemailer SMTP + Dev fallback)
│   │   ├── pagination/            # Reusable pagination helpers
│   │   └── enums/                 # Application-wide domain enums
│   └── modules/
│       ├── auth/                  # ✅ Fully implemented: JWT, refresh tokens, OTP, email verify
│       │   ├── cron/              # VerificationCleanupCron (every 30 min)
│       │   └── ...
│       ├── user/                  # 🟡 UserDbService (complete), UserService (scaffolded)
│       ├── products/              # ⚙️ Scaffolded — controllers, DTOs, db.service
│       ├── category/              # ⚙️ Scaffolded — hierarchical categories
│       ├── brands/                # ⚙️ Scaffolded — brand management
│       ├── supplier/              # ⚙️ Scaffolded — supplier management
│       ├── inventory/             # ⚙️ Scaffolded — stock levels & transaction ledger
│       ├── batchs/                # ⚙️ Scaffolded — FEFO batch tracking
│       ├── cart/                  # ⚙️ Scaffolded — shopping cart
│       ├── order/                 # ⚙️ Scaffolded — orders & order lifecycle state machine
│       ├── payment/               # ⚙️ Scaffolded — payment gateway & mock callbacks
│       ├── review/                # ⚙️ Scaffolded — product reviews & ratings
│       ├── notification/          # ⚙️ Scaffolded — notification system
│       ├── dashboard/             # ⚙️ Scaffolded — admin reporting & CSV export
│       ├── audit/                 # 🟡 AuditService (active logger), AuditDbService (scaffolded)
│       ├── events/                # ⚙️ Scaffolded — SSE event streams
│       └── health/                # ✅ Health check endpoint
└── final-year-project/            # Detailed reference guides & specifications
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

# SMTP Mail Configuration (Optional for Dev, required for production emails)
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

## 📦 Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@nestjs/common` | ^11.0.1 | NestJS core framework |
| `@nestjs/jwt` | ^11.0.2 | JWT access token issuance & verification |
| `@nestjs/schedule` | ^5.0.1 | Cron job scheduling |
| `@nestjs/throttler` | ^6.7.1 | Rate limiting |
| `@prisma/client` | ^7.10.1 | Database ORM client |
| `@prisma/adapter-pg` | ^7.10.1 | Prisma PostgreSQL adapter |
| `bcryptjs` | ^3.0.3 | Password hashing (cost factor 12) |
| `cookie-parser` | ^1.4.7 | HttpOnly refresh token cookie parsing |
| `helmet` | ^8.3.0 | HTTP security headers |
| `nodemailer` | ^10.2.1 | SMTP email delivery |
| `class-validator` | ^0.15.1 | DTO validation |

---

## 🎯 Next Implementation Roadmap (Agli Manzil)

Project acceptance roadmap ke mutabiq aglay marhalay:

1. **User Profile Management**:
   - `UserService` ko `UserDbService` ke sath wire karna.
   - Profile update, address management, aur user preferences implement karna.

2. **Category & Product Management**:
   - `ProductsService` and `CategoryService` ko Prisma database queries ke sath jorna.
   - Public product browsing with filtering (`isActive = true`), pagination, search, aur category hierarchy traversal.

3. **Brands & Suppliers CRUD**:
   - `BrandDbService` aur `SupplierDbService` mein Prisma CRUD queries implement karna.

4. **Inventory Stock Ledger**:
   - Products ke sath stock quantity sync karna aur low-stock thresholds handle karna.
   - Stock adjustments par `InventoryTransaction` ledger maintain karna.

5. **Cart Operations**:
   - Cart mein items add/update karte waqt inventory stock check validate karna.

6. **Order State Machine & Checkout**:
   - Order creation par atomic transaction mein stock reserve / decrement karna.
   - Order lifecycle transitions (`PENDING` → `CONFIRMED` → `PROCESSING` → `DELIVERED`).
   - Order cancellation par stock restore karna.

7. **Payment Mock Gateway**:
   - Order checkout ke baad mock payment webhook trigger karke order status `PAID` / `PROCESSING` par transition karna.

8. **Reviews & Ratings**:
   - Delivered orders ke liye product review submit karna.
   - Admin moderation flow implement karna.

9. **Audit Log DB Persistence**:
   - `AuditDbService` mein Prisma write queries wire karna taake audit trail `AuditLog` table mein persist ho.
