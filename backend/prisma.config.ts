import { defineConfig } from '@prisma/config';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    seed: 'npx ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://mayode:Mayode%402026@localhost:5432/mayode_db?schema=public',
  },
});
