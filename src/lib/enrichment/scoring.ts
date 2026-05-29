// ─────────────────────────────────────────────
// FanPulse — Engagement Scoring & RFM Engine
//
// Computes RFM (Recency, Frequency, Monetary) scores
// and assigns supporter segments. Run after each pipeline sync.
// ─────────────────────────────────────────────

import { prisma, getClubId } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { SupporterSegment } from '@/types';

export async function runEnrichment(): Promise<{ updated: number; durationMs: number }> {
  const clubId = getClubId();
  const start = Date.now();
  logger.info({ clubId }, 'Starting enrichment run');

  const supporters = await prisma.supporter.findMany({
    where: { clubId },
    include: { events: true, memberships: true },
  });

  const now = new Date();
  let updated = 0;

  // Cohort-level stats for normalisation
  const allLTV = supporters.map((s) =>
    s.events.reduce((sum, e) => sum + (e.value ?? 0), 0),
  );
  const maxLTV = Math.max(...allLTV, 1);

  const allFrequencies = supporters.map((s) =>
    s.events.filter((e) => e.source === 'ticketing').length,
  );
  const maxFreq = Math.max(...allFrequencies, 1);

  for (const supporter of supporters) {
    const events = supporter.events;

    // ── Recency ────────────────────────────────
    const lastEvent = events.reduce<Date | null>((latest, e) => {
      return !latest || e.eventDate > latest ? e.eventDate : latest;
    }, null);

    const daysSinceLastEvent = lastEvent
      ? Math.floor((now.getTime() - lastEvent.getTime()) / (1000 * 60 * 60 * 24))
      : 9999;

    const recencyScore = Math.max(0, 100 - (daysSinceLastEvent / 730) * 100);

    // ── Frequency ──────────────────────────────
    const matchesAttended = events.filter((e) => e.eventType === 'ticket_purchased').length;
    const frequencyScore = Math.min(100, (matchesAttended / maxFreq) * 100);

    // ── Monetary ───────────────────────────────
    const lifetimeValue = events.reduce((sum, e) => sum + (e.value ?? 0), 0);
    const monetaryScore = Math.min(100, (lifetimeValue / maxLTV) * 100);

    // ── Combined (weighted 40/35/25) ───────────
    const engagementScore = recencyScore * 0.4 + frequencyScore * 0.35 + monetaryScore * 0.25;

    // ── Churn risk ─────────────────────────────
    const churnRisk = daysSinceLastEvent > 90 && engagementScore > 20
      ? Math.min(1, daysSinceLastEvent / 365)
      : daysSinceLastEvent > 365
        ? 0.9
        : 0.1;

    const segment = assignSegment(engagementScore, daysSinceLastEvent, matchesAttended);

    await prisma.supporter.update({
      where: { id: supporter.id },
      data: {
        engagementScore: Math.round(engagementScore * 10) / 10,
        lifetimeValue: Math.round(lifetimeValue * 100) / 100,
        churnRisk: Math.round(churnRisk * 1000) / 1000,
        recencyScore: Math.round(recencyScore * 10) / 10,
        frequencyScore: Math.round(frequencyScore * 10) / 10,
        monetaryScore: Math.round(monetaryScore * 10) / 10,
        segment,
        segmentedAt: new Date(),
      },
    });

    updated++;
  }

  const durationMs = Date.now() - start;
  logger.info({ clubId, updated, durationMs }, 'Enrichment complete');
  return { updated, durationMs };
}

function assignSegment(
  engagementScore: number,
  daysSinceLastEvent: number,
  matchesAttended: number,
): SupporterSegment {
  if (engagementScore >= 75 && daysSinceLastEvent <= 60) return 'champion';
  if (engagementScore >= 55 && matchesAttended >= 10) return 'loyal';
  if (engagementScore >= 40 && daysSinceLastEvent <= 90) return 'potential_loyalist';
  if (daysSinceLastEvent <= 30 && matchesAttended <= 2) return 'new_fan';
  if (engagementScore >= 30 && daysSinceLastEvent > 90 && daysSinceLastEvent <= 180) return 'at_risk';
  if (daysSinceLastEvent > 180 && daysSinceLastEvent <= 365) return 'lapsed';
  if (daysSinceLastEvent > 365) return 'hibernating';
  return 'casual';
}
