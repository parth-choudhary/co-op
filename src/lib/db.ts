import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: any | undefined };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://coop:coop@localhost:5433/coop';
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new (PrismaClient as any)({ adapter });
}

export const prisma: any = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
export default prisma;
