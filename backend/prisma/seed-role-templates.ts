/**
 * One-off backfill: gives every existing cooperative (and the platform) the ready-made
 * sale-workflow roles. New cooperatives get them automatically when their administrator is
 * created. A scope that already has roles of its own is left alone, and roles are never
 * overwritten, so nothing an owner has customised or deleted is touched.
 *
 *   npm run roles:templates
 */
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { createRoleTemplates } from '../src/roles/role-templates';

dotenv.config();
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://mayode:Mayode%402026@localhost:5432/mayode_db?schema=public',
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const scopes: { id: string | null; label: string; builtIn: string }[] = [
    { id: null, label: 'Platform', builtIn: 'Super Admin' },
    ...(await prisma.mamcos.findMany({ select: { id: true, name: true } })).map((m) => ({
      id: m.id, label: m.name, builtIn: 'Cooperative Admin',
    })),
  ];
  for (const scope of scopes) {
    const own = await prisma.role.count({ where: { mamcosId: scope.id, name: { not: scope.builtIn } } });
    if (own > 0) {
      console.log(`skip    ${scope.label}: already has ${own} role(s) of its own`);
      continue;
    }
    const created = await prisma.$transaction((tx) => createRoleTemplates(tx, scope.id));
    console.log(`created ${scope.label}: ${created.join(', ') || 'nothing'}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); await pool.end(); });
