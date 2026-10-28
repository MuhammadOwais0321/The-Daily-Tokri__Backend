import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not configured in the environment variables');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seed for Admin user...');

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME?.trim() || 'Admin';

  if (!adminEmail || !adminPassword) {
    console.error(
      '❌ Error: ADMIN_EMAIL and ADMIN_PASSWORD must be configured in your .env file.',
    );
    process.exit(1);
  }

  // 1. Single Admin Policy Check: Check if an ADMIN already exists in the database
  const existingAdmin = await prisma.user.findFirst({
    where: {
      role: UserRole.ADMIN,
    },
  });

  // 2. Hash password using bcrypt with cost 12 (as per security requirements)
  console.log('🔒 Hashing admin password with bcrypt (cost 12)...');
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  if (existingAdmin) {
    if (existingAdmin.email.toLowerCase() === adminEmail) {
      console.log(
        `ℹ️  Admin already exists with this email (${existingAdmin.email}). Updating credentials...`,
      );
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          name: adminName,
          passwordHash,
          isActive: true,
          isEmailVerified: true,
        },
      });
      console.log('✅ Admin credentials updated successfully.');
      return;
    }

    console.log(
      `⚠️  An Admin account already exists in database with a different email (${existingAdmin.email}, ID: ${existingAdmin.id}).`,
    );
    console.log('ℹ️  Skipping creation as per Single Admin policy (docs 06 §5).');
    return;
  }

  // 3. Check if user already exists (e.g. was registered as Customer during testing)
  const userWithSameEmail = await prisma.user.findUnique({
    where: {
      email: adminEmail,
    },
  });

  let admin;
  if (userWithSameEmail) {
    console.log(
      `ℹ️  User "${adminEmail}" was previously registered as ${userWithSameEmail.role}. Upgrading to single ADMIN...`,
    );
    admin = await prisma.user.update({
      where: { id: userWithSameEmail.id },
      data: {
        name: adminName,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
        isEmailVerified: true,
      },
    });
  } else {
    // 4. Create new single Admin user
    admin = await prisma.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
        isEmailVerified: true,
      },
    });
  }

  // 5. Ensure default preferences exist for the admin
  await prisma.userPreference.upsert({
    where: { userId: admin.id },
    create: {
      userId: admin.id,
      pushNotification: true,
      emailNotification: true,
    },
    update: {},
  });

  console.log('🎉 Admin user successfully seeded:');
  console.log(`   - ID: ${admin.id}`);
  console.log(`   - Name: ${admin.name}`);
  console.log(`   - Email: ${admin.email}`);
  console.log(`   - Role: ${admin.role}`);
  console.log(`   - Email Verified: ${admin.isEmailVerified}`);
  console.log(`   - Active: ${admin.isActive}`);
}

main()
  .catch((e) => {
    console.error('❌ Failed to seed database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
