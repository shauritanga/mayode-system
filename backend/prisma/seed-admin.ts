import { PrismaClient, UserRole } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://mayode:Mayode%402026@localhost:5432/mayode_db?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Seeds (or refreshes) the platform admin account used for testing.
 * Idempotent: keyed on the unique phone column, so re-runs update the
 * password/name instead of failing on the unique constraint.
 */
async function main() {
  const phone = '+255748571660';
  const password = 'Mayode@2026';

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const user = await prisma.user.upsert({
    where: { phone },
    update: {
      firstName: 'Elisha',
      lastName: 'Mayode',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      firstName: 'Elisha',
      lastName: 'Mayode',
      phone,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      language: 'en',
    },
  });

  console.log(`Admin user seeded: ${user.firstName} ${user.lastName} (${user.phone}) — role ${user.role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
