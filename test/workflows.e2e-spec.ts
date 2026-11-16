import 'dotenv/config';
import { execSync } from 'child_process';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentStatus, UserRole } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { Client } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/common/services/email.service';
import { DatabaseService } from '../src/database/database.service';
import { ErrorsExceptionFilter } from '../src/filters/errors.exception.filter';
import { MockPaymentGateway } from '../src/infrastructure/payment/mock-payment.gateway';
import { PAYMENT_GATEWAY } from '../src/infrastructure/payment/payment-gateway.interface';
import { AuthService } from '../src/modules/auth/auth.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { OrderPaymentTimeoutCron } from '../src/modules/order/cron/order-payment-timeout.cron';
import { RefundRetryCron } from '../src/modules/payment/cron/refund-retry.cron';

function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL must be set to derive test database URL');
  }
  const parsed = new URL(baseUrl);
  const dbName = parsed.pathname.replace(/^\/+/, '');
  parsed.pathname = `/${dbName.endsWith('_test') ? dbName : `${dbName}_test`}`;
  return parsed.toString();
}

async function ensureTestDatabaseAndMigrate(testDbUrl: string): Promise<void> {
  const parsed = new URL(testDbUrl);
  const testDbName = parsed.pathname.replace(/^\/+/, '');
  if (!testDbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run E2E database reset on non-test database "${testDbName}"`,
    );
  }

  const adminUrl = new URL(testDbUrl);
  adminUrl.pathname = '/postgres';

  const pgClient = new Client({ connectionString: adminUrl.toString() });
  await pgClient.connect();
  try {
    const exists = await pgClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [testDbName],
    );
    if (exists.rowCount === 0) {
      await pgClient.query(`CREATE DATABASE "${testDbName}"`);
    }
  } finally {
    await pgClient.end();
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: testDbUrl },
  });
}

describe('Critical E2E Workflows (Real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: DatabaseService;
  let authService: AuthService;
  let passwordService: PasswordService;
  let paymentGateway: MockPaymentGateway;
  let timeoutCron: OrderPaymentTimeoutCron;
  let refundRetryCron: RefundRetryCron;
  const capturedOtps = new Map<string, string>();
  let ipCounter = 1;

  let adminToken: string;
  let categoryId: string;
  let productId: string;
  let inventoryId: string;

  beforeAll(async () => {
    const testDbUrl = resolveTestDatabaseUrl();
    process.env.DATABASE_URL = testDbUrl;

    await ensureTestDatabaseAndMigrate(testDbUrl);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const expressApp = app.getHttpAdapter().getInstance() as {
      set: (key: string, value: boolean) => void;
    };
    expressApp.set('trust proxy', true);

    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ErrorsExceptionFilter());

    const emailService = app.get(EmailService);
    jest
      .spyOn(emailService, 'sendVerificationCode')
      .mockImplementation((email: string, code: string) => {
        capturedOtps.set(email.toLowerCase(), code);
        return Promise.resolve(true);
      });

    await app.init();

    db = app.get(DatabaseService);
    authService = app.get(AuthService);
    passwordService = app.get(PasswordService);
    paymentGateway = app.get<MockPaymentGateway>(PAYMENT_GATEWAY);
    timeoutCron = app.get(OrderPaymentTimeoutCron);
    refundRetryCron = app.get(RefundRetryCron);
  }, 30000);

  beforeEach(async () => {
    capturedOtps.clear();

    // Reset all tables and sequences cleanly before each test
    await db.$executeRawUnsafe(`
      TRUNCATE TABLE
        "review_images",
        "reviews",
        "notifications",
        "payments",
        "order_addresses",
        "inventory_transactions",
        "order_items",
        "orders",
        "cart_items",
        "carts",
        "inventory_batches",
        "inventory",
        "product_allergens",
        "product_images",
        "products",
        "categories",
        "brands",
        "suppliers",
        "addresses",
        "user_preferences",
        "verification_codes",
        "audit_logs",
        "users"
      RESTART IDENTITY CASCADE;
    `);
    await db.$executeRawUnsafe(
      `ALTER SEQUENCE IF EXISTS "order_number_seq" RESTART WITH 1;`,
    );
    await db.$executeRawUnsafe(
      `ALTER SEQUENCE IF EXISTS "product_sku_seq" RESTART WITH 1;`,
    );

    // Seed single ADMIN user and generate access token
    const adminPasswordHash =
      await passwordService.hashPassword('AdminPass123!');
    const adminUser = await db.user.create({
      data: {
        name: 'Store Admin',
        email: 'admin@onlinemart.uk',
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        isActive: true,
        isEmailVerified: true,
      },
    });

    const tokens = await authService.generateTokens(adminUser);
    adminToken = tokens.accessToken;

    // Seed leaf Category + Product + Inventory via Admin endpoints
    const catRes = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Fresh Fruits', isActive: true })
      .expect(201);
    categoryId = (catRes.body as { id: string }).id;

    const prodRes = await request(app.getHttpServer())
      .post('/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Organic Apples',
        categoryId,
        price: 5.5,
        minimumOrderQuantity: 1,
        maximumOrderQuantity: 10,
        storageType: 'AMBIENT',
        unitOfMeasure: 'PACK',
        batchTracked: false,
      })
      .expect(201);
    productId = (prodRes.body as { id: string }).id;

    const invRes = await request(app.getHttpServer())
      .post('/admin/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId,
        qtyOnHand: 20,
        lowStockThreshold: 5,
      })
      .expect(201);
    inventoryId = (invRes.body as { id: string }).id;
  });

  afterEach(async () => {
    // Allow fire-and-forget background promises (audit / notifications) to settle before next test truncates DB
    await new Promise((resolve) => setTimeout(resolve, 60));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /** Registers, verifies email via captured OTP, and logs in a customer. */
  async function registerAndLoginCustomer(
    email: string,
    name = 'Test Customer',
    password = 'CustomerPass123!',
  ): Promise<{ token: string; userId: string }> {
    const clientIp = `10.0.0.${ipCounter++}`;

    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .set('X-Forwarded-For', clientIp)
      .send({ name, email, password })
      .expect(201);

    const userId = (regRes.body as { user: { id: string } }).user.id;
    const otp = capturedOtps.get(email.toLowerCase());
    expect(otp).toBeDefined();

    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .set('X-Forwarded-For', clientIp)
      .send({ email, code: otp })
      .expect(200);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', clientIp)
      .send({ email, password })
      .expect(200);

    return {
      token: (loginRes.body as { accessToken: string }).accessToken,
      userId,
    };
  }

  it('1. Full checkout: register -> login -> add to cart -> create order -> mock-complete success -> order CONFIRMED, cart empty, stock deducted', async () => {
    const { token, userId } = await registerAndLoginCustomer(
      'alice@example.com',
      'Alice Smith',
    );

    // Add 2 packs of Organic Apples (£5.50 each = £11.00) to cart
    const cartRes = await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 2 })
      .expect(201);

    expect((cartRes.body as { subtotal: string }).subtotal).toBe('11.00');

    // Place DELIVERY order with inline shippingAddress
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryType: 'DELIVERY',
        shippingAddress: {
          addressLine: '221B Baker Street',
          city: 'London',
          county: 'Greater London',
          postcode: 'NW1 6XE',
        },
      })
      .expect(201);

    const order = orderRes.body as {
      id: string;
      status: string;
      paymentStatus: string;
      total: string;
    };
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.paymentStatus).toBe(PaymentStatus.UNPAID);
    expect(order.total).toBe('11.00');

    // Verify cart is cleared in the same transaction
    const emptyCartRes = await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((emptyCartRes.body as { items: unknown[] }).items).toHaveLength(0);

    // Verify stock was deducted (20 - 2 = 18)
    const invAfterOrder = await db.inventory.findUnique({
      where: { id: inventoryId },
    });
    expect(invAfterOrder?.qtyOnHand).toBe(18);

    // Initiate payment
    const initPayRes = await request(app.getHttpServer())
      .post('/payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.id })
      .expect(200);

    const paymentId = (initPayRes.body as { paymentId: string }).paymentId;
    expect(paymentId).toBeDefined();

    // Complete payment via mock-complete
    const completeRes = await request(app.getHttpServer())
      .post(`/payments/${paymentId}/mock-complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'succeeded' })
      .expect(200);

    expect((completeRes.body as { status: string }).status).toBe(
      PaymentStatus.PAID,
    );

    // Verify order is now CONFIRMED & PAID
    const orderDetailRes = await request(app.getHttpServer())
      .get(`/orders/me/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const confirmedOrder = orderDetailRes.body as {
      status: string;
      paymentStatus: string;
    };
    expect(confirmedOrder.status).toBe(OrderStatus.CONFIRMED);
    expect(confirmedOrder.paymentStatus).toBe(PaymentStatus.PAID);

    // Verify user stats updated
    const updatedUser = await db.user.findUnique({ where: { id: userId } });
    expect(updatedUser?.totalOrders).toBe(1);
    expect(updatedUser?.totalSpent.toFixed(2)).toBe('11.00');
  });

  it('2. Admin flow: CONFIRMED order -> PROCESSING -> READY_FOR_DELIVERY -> DELIVERED', async () => {
    const { token } = await registerAndLoginCustomer('bob@example.com', 'Bob');

    await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryType: 'DELIVERY',
        shippingAddress: {
          addressLine: '10 Downing Street',
          city: 'London',
          county: 'Greater London',
          postcode: 'SW1A 2AA',
        },
      })
      .expect(201);
    const orderId = (orderRes.body as { id: string }).id;

    const initPayRes = await request(app.getHttpServer())
      .post('/payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId })
      .expect(200);
    const paymentId = (initPayRes.body as { paymentId: string }).paymentId;

    await request(app.getHttpServer())
      .post(`/payments/${paymentId}/mock-complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'succeeded' })
      .expect(200);

    // Admin advances CONFIRMED -> PROCESSING
    const procRes = await request(app.getHttpServer())
      .patch(`/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: OrderStatus.PROCESSING })
      .expect(200);
    expect((procRes.body as { status: string }).status).toBe(
      OrderStatus.PROCESSING,
    );
    expect(
      (procRes.body as { processedAt: string | null }).processedAt,
    ).toBeTruthy();

    // Delivery-type mismatch: READY_FOR_PICKUP on DELIVERY order -> 400
    await request(app.getHttpServer())
      .patch(`/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: OrderStatus.READY_FOR_PICKUP })
      .expect(400);

    // Admin advances PROCESSING -> READY_FOR_DELIVERY
    const readyRes = await request(app.getHttpServer())
      .patch(`/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: OrderStatus.READY_FOR_DELIVERY })
      .expect(200);
    expect((readyRes.body as { status: string }).status).toBe(
      OrderStatus.READY_FOR_DELIVERY,
    );
    expect((readyRes.body as { readyAt: string | null }).readyAt).toBeTruthy();

    // Admin advances READY_FOR_DELIVERY -> DELIVERED
    const delivRes = await request(app.getHttpServer())
      .patch(`/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: OrderStatus.DELIVERED })
      .expect(200);
    expect((delivRes.body as { status: string }).status).toBe(
      OrderStatus.DELIVERED,
    );
    expect(
      (delivRes.body as { deliveredAt: string | null }).deliveredAt,
    ).toBeTruthy();
  });

  it('3. Customer cancel (paid): CONFIRMED -> cancel -> REFUND_PENDING -> refund -> CANCELLED, stock restored, totalOrders -1', async () => {
    const { token, userId } = await registerAndLoginCustomer(
      'charlie@example.com',
      'Charlie',
    );

    await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 3 })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryType: 'DELIVERY',
        shippingAddress: {
          addressLine: '1 Abbey Road',
          city: 'London',
          county: 'Greater London',
          postcode: 'NW8 9AY',
        },
      })
      .expect(201);
    const orderId = (orderRes.body as { id: string }).id;

    // Stock deducted from 20 to 17
    const invBeforeCancel = await db.inventory.findUnique({
      where: { id: inventoryId },
    });
    expect(invBeforeCancel?.qtyOnHand).toBe(17);

    const initPayRes = await request(app.getHttpServer())
      .post('/payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId })
      .expect(200);
    const paymentId = (initPayRes.body as { paymentId: string }).paymentId;

    await request(app.getHttpServer())
      .post(`/payments/${paymentId}/mock-complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'succeeded' })
      .expect(200);

    const userAfterPay = await db.user.findUnique({ where: { id: userId } });
    expect(userAfterPay?.totalOrders).toBe(1);
    expect(userAfterPay?.totalSpent.toFixed(2)).toBe('16.50');

    // Customer cancels paid CONFIRMED order -> immediate transaction state is REFUND_PENDING
    const cancelRes = await request(app.getHttpServer())
      .patch(`/orders/me/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'CHANGED_MIND' })
      .expect(200);

    const cancelBody = cancelRes.body as {
      status: string;
      paymentStatus: string;
    };
    expect([OrderStatus.REFUND_PENDING, OrderStatus.CANCELLED]).toContain(
      cancelBody.status,
    );

    // Ensure post-commit refund completes (or run refund retry cron) -> transitions to CANCELLED + REFUNDED
    await refundRetryCron.handleRefundRetry();

    const finalOrderRes = await request(app.getHttpServer())
      .get(`/orders/me/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const finalOrder = finalOrderRes.body as {
      status: string;
      paymentStatus: string;
    };
    expect(finalOrder.status).toBe(OrderStatus.CANCELLED);
    expect(finalOrder.paymentStatus).toBe(PaymentStatus.REFUNDED);

    // Stock restored back to 20
    const invAfterCancel = await db.inventory.findUnique({
      where: { id: inventoryId },
    });
    expect(invAfterCancel?.qtyOnHand).toBe(20);

    // User totalOrders (-1 -> 0) and totalSpent (0.00) restored
    const userAfterCancel = await db.user.findUnique({ where: { id: userId } });
    expect(userAfterCancel?.totalOrders).toBe(0);
    expect(userAfterCancel?.totalSpent.toFixed(2)).toBe('0.00');
  });

  it('4. Timeout: unpaid order -> paymentExpiresAt past -> cron -> CANCELLED, stock restored', async () => {
    const { token } = await registerAndLoginCustomer(
      'diana@example.com',
      'Diana',
    );

    await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 4 })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryType: 'DELIVERY',
        shippingAddress: {
          addressLine: '50 Oxford Street',
          city: 'London',
          county: 'Greater London',
          postcode: 'W1D 1BS',
        },
      })
      .expect(201);
    const orderId = (orderRes.body as { id: string }).id;

    // Stock is now 16 (20 - 4)
    const invAfterCreate = await db.inventory.findUnique({
      where: { id: inventoryId },
    });
    expect(invAfterCreate?.qtyOnHand).toBe(16);

    // Force paymentExpiresAt into the past
    await db.order.update({
      where: { id: orderId },
      data: { paymentExpiresAt: new Date(Date.now() - 60_000) },
    });

    // Run timeout cron sweep
    await timeoutCron.handlePaymentTimeoutSweep();

    // Verify order is CANCELLED with reason PAYMENT_TIMEOUT and stock is back to 20
    const expiredOrder = await db.order.findUnique({ where: { id: orderId } });
    expect(expiredOrder?.status).toBe(OrderStatus.CANCELLED);
    expect(expiredOrder?.cancellationReason).toBe('PAYMENT_TIMEOUT');

    const invAfterTimeout = await db.inventory.findUnique({
      where: { id: inventoryId },
    });
    expect(invAfterTimeout?.qtyOnHand).toBe(20);
  });

  it('5. Oversell race: stock 1, 2 customers parallel -> 1 success (201), 1 fail (400), final stock 0', async () => {
    // Set stock to exactly 1 unit
    await db.inventory.update({
      where: { id: inventoryId },
      data: { qtyOnHand: 1 },
    });

    const custA = await registerAndLoginCustomer(
      'race-a@example.com',
      'Race A',
    );
    const custB = await registerAndLoginCustomer(
      'race-b@example.com',
      'Race B',
    );

    // Both customers add 1 unit to their respective carts
    await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${custA.token}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${custB.token}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    const payload = {
      deliveryType: 'DELIVERY',
      shippingAddress: {
        addressLine: '1 Race Street',
        city: 'London',
        county: 'Greater London',
        postcode: 'E1 6AN',
      },
    };

    // Fire both checkout requests in parallel
    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${custA.token}`)
        .send(payload),
      request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${custB.token}`)
        .send(payload),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 400]);

    const finalInv = await db.inventory.findUnique({
      where: { id: inventoryId },
    });
    expect(finalInv?.qtyOnHand).toBe(0);
  });

  it('6. Webhook duplicate: same succeeded webhook 2x -> totalOrders +1 only', async () => {
    const { token, userId } = await registerAndLoginCustomer(
      'webhook@example.com',
      'Webhook User',
    );

    await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 2 })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryType: 'DELIVERY',
        shippingAddress: {
          addressLine: '99 Fleet Street',
          city: 'London',
          county: 'Greater London',
          postcode: 'EC4Y 1AA',
        },
      })
      .expect(201);
    const orderId = (orderRes.body as { id: string }).id;

    const initPayRes = await request(app.getHttpServer())
      .post('/payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId })
      .expect(200);
    const gatewayRef = (initPayRes.body as { gatewayRef: string }).gatewayRef;

    const eventPayload = {
      id: 'evt_duplicate_test_001',
      type: 'payment_intent.succeeded' as const,
      gatewayRef,
    };

    const { signature } = paymentGateway.buildSignedWebhookEvent(eventPayload);

    // Invalid signature -> 400
    await request(app.getHttpServer())
      .post('/webhooks/payments/mock')
      .set('x-signature', 'deadbeef')
      .send(eventPayload)
      .expect(400);

    // First valid delivery -> 200
    await request(app.getHttpServer())
      .post('/webhooks/payments/mock')
      .set('x-signature', signature)
      .send(eventPayload)
      .expect(200);

    // Second duplicate delivery -> 200 (idempotent)
    await request(app.getHttpServer())
      .post('/webhooks/payments/mock')
      .set('x-signature', signature)
      .send(eventPayload)
      .expect(200);

    const user = await db.user.findUnique({ where: { id: userId } });
    expect(user?.totalOrders).toBe(1);
    expect(user?.totalSpent.toFixed(2)).toBe('11.00');
  });

  it('7. IDOR: another user order -> 404; another user address -> 404', async () => {
    const owner = await registerAndLoginCustomer(
      'owner@example.com',
      'Owner User',
    );
    const attacker = await registerAndLoginCustomer(
      'attacker@example.com',
      'Attacker User',
    );

    // Owner creates an address
    const addrRes = await request(app.getHttpServer())
      .post('/addresses')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        addressLine: '12 Owner Lane',
        city: 'London',
        county: 'Greater London',
        postcode: 'SE1 9SG',
        latitude: 51.5074,
        longitude: -0.1278,
        isDefault: true,
      })
      .expect(201);
    const ownerAddressId = (addrRes.body as { id: string }).id;

    // Owner creates an order
    await request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        deliveryType: 'DELIVERY',
        addressId: ownerAddressId,
      })
      .expect(201);
    const ownerOrderId = (orderRes.body as { id: string }).id;

    // Attacker tries to GET or CANCEL owner's order -> 404
    await request(app.getHttpServer())
      .get(`/orders/me/${ownerOrderId}`)
      .set('Authorization', `Bearer ${attacker.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/orders/me/${ownerOrderId}/cancel`)
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ reason: 'CHANGED_MIND' })
      .expect(404);

    // Attacker tries to GET, PATCH, or DELETE owner's address -> 404
    await request(app.getHttpServer())
      .get(`/addresses/${ownerAddressId}`)
      .set('Authorization', `Bearer ${attacker.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/addresses/${ownerAddressId}`)
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ city: 'Manchester' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/addresses/${ownerAddressId}`)
      .set('Authorization', `Bearer ${attacker.token}`)
      .expect(404);
  });

  it('8. Auth: no token -> 401, customer -> admin route -> 403, deactivated user -> 403', async () => {
    // 1) No token -> 401
    await request(app.getHttpServer()).get('/orders/me').expect(401);

    // 2) Mass assignment attempt (`role: ADMIN` in register) -> 400
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Hacker',
        email: 'hacker@example.com',
        password: 'Password123!',
        role: 'ADMIN',
      })
      .expect(400);

    // 3) Customer calling Admin route -> 403
    const customer = await registerAndLoginCustomer(
      'cust-guard@example.com',
      'Guard Customer',
    );

    await request(app.getHttpServer())
      .get('/admin/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/admin/dashboard')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);

    // 4) Admin deactivates Customer -> Customer's existing JWT immediately gets 403
    await request(app.getHttpServer())
      .patch(`/user/${customer.userId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
  });
});
