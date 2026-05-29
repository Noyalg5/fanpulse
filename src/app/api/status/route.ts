// GET /api/status — pipeline health overview, scoped to current club

import { NextResponse } from 'next/server';
import { prisma, getClubId } from '@/lib/db';

export async function GET() {
  const clubId = getClubId();

  const [recentLogs, supporterCount, sourceConfigs] = await Promise.all([
    prisma.ingestionLog.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.supporter.count({ where: { clubId } }),
    prisma.dataSourceConfig.findMany({ where: { clubId } }),
  ]);

  const sourceHealth = ['ticketing', 'membership', 'ecommerce', 'social'].map((source) => {
    const config = sourceConfigs.find((c) => c.source === source);
    const lastRun = recentLogs.find((l) => l.source === source);
    return {
      source,
      enabled: config?.enabled ?? true,
      lastSyncAt: config?.lastSyncAt ?? null,
      lastRunStatus: lastRun?.status ?? 'never_run',
      lastRunAt: lastRun?.startedAt ?? null,
    };
  });

  return NextResponse.json({
    clubId,
    supporters: { total: supporterCount },
    pipeline: { sources: sourceHealth },
    recentRuns: recentLogs.slice(0, 5),
  });
}
