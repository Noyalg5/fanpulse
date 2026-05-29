import { PrismaClient } from '@prisma/client';

// Singleton Prisma client — prevents connection pool exhaustion in Next.js dev mode
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Returns the CLUB_ID for the current deployment.
 * All Prisma queries must scope their data to this club.
 * Set via the CLUB_ID environment variable — printed by `npm run db:seed` on first run.
 */
export function getClubId(): string {
  const clubId = process.env.CLUB_ID;
  if (!clubId) {
    throw new Error(
      'CLUB_ID environment variable is required. ' +
      'Run `npm run db:seed` to create a Club record and get your CLUB_ID.',
    );
  }
  return clubId;
}
