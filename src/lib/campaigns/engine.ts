import { subDays, startOfDay, endOfDay } from 'date-fns';
import { prisma, getClubId } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';

// ── Trigger config types ───────────────────────────────────────

type LapsedMembershipTrigger = {
  event: 'membership_lapsed';
  daysAfter: number;
};

type SegmentTrigger = {
  segment: string;
};

type TicketInactivityTrigger = {
  event: 'ticket_purchased';
  daysAfter: number;
  noPurchaseSince: true;
};

type TriggerConfig = LapsedMembershipTrigger | SegmentTrigger | TicketInactivityTrigger;

export type EvaluateResult = {
  campaignId: string;
  campaignName: string;
  newRecipients: number;
};

// ── Config parser ──────────────────────────────────────────────

function parseTriggerConfig(json: Prisma.JsonValue): TriggerConfig | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const c = json as Record<string, unknown>;

  if (typeof c.segment === 'string') return { segment: c.segment };
  if (c.event === 'membership_lapsed' && typeof c.daysAfter === 'number') {
    return { event: 'membership_lapsed', daysAfter: c.daysAfter };
  }
  if (c.event === 'ticket_purchased' && typeof c.daysAfter === 'number' && c.noPurchaseSince === true) {
    return { event: 'ticket_purchased', daysAfter: c.daysAfter, noPurchaseSince: true };
  }
  return null;
}

// ── Trigger evaluators ─────────────────────────────────────────

async function findMatchingSupporters(
  config: TriggerConfig,
  clubId: string,
): Promise<{ id: string; emailConsent: boolean }[]> {
  const now = new Date();

  if ('segment' in config) {
    return prisma.supporter.findMany({
      where: {
        clubId,
        segment: config.segment,
        segmentedAt: { gte: subDays(now, 7) },
      },
      select: { id: true, emailConsent: true },
    });
  }

  if (config.event === 'membership_lapsed') {
    const targetDay = subDays(now, config.daysAfter);
    return prisma.supporter.findMany({
      where: {
        clubId,
        memberships: {
          some: {
            status: 'expired',
            endDate: { gte: startOfDay(targetDay), lte: endOfDay(targetDay) },
          },
        },
        NOT: { memberships: { some: { status: 'active' } } },
      },
      select: { id: true, emailConsent: true },
    });
  }

  if (config.event === 'ticket_purchased' && config.noPurchaseSince) {
    const cutoff = subDays(now, config.daysAfter);
    return prisma.supporter.findMany({
      where: {
        clubId,
        AND: [
          { events: { some: { eventType: 'ticket_purchased' } } },
          { events: { none: { eventType: 'ticket_purchased', eventDate: { gte: cutoff } } } },
        ],
      },
      select: { id: true, emailConsent: true },
    });
  }

  return [];
}

// ── Main evaluation function ───────────────────────────────────

export async function evaluateTriggeredCampaigns(): Promise<EvaluateResult[]> {
  const clubId = getClubId();

  const campaigns = await prisma.campaign.findMany({
    where: { clubId, status: 'active', type: 'triggered' },
  });

  logger.info({ clubId, count: campaigns.length }, 'Evaluating triggered campaigns');

  const results: EvaluateResult[] = [];

  for (const campaign of campaigns) {
    const config = parseTriggerConfig(campaign.triggerConfig);

    if (!config) {
      logger.warn({ campaignId: campaign.id, triggerConfig: campaign.triggerConfig },
        'Unrecognised triggerConfig — skipping');
      results.push({ campaignId: campaign.id, campaignName: campaign.name, newRecipients: 0 });
      continue;
    }

    try {
      const matching = await findMatchingSupporters(config, clubId);

      const existing = await prisma.campaignRecipient.findMany({
        where: { campaignId: campaign.id },
        select: { supporterId: true },
      });
      const existingIds = new Set(existing.map((r) => r.supporterId));

      const newSupps = matching.filter((s) => s.emailConsent && !existingIds.has(s.id));

      if (newSupps.length > 0) {
        await prisma.campaignRecipient.createMany({
          data: newSupps.map((s) => ({
            campaignId: campaign.id,
            supporterId: s.id,
            status: 'pending',
          })),
          skipDuplicates: true,
        });
      }

      logger.info({ campaignId: campaign.id, campaignName: campaign.name, newRecipients: newSupps.length },
        'Campaign evaluation complete');

      results.push({ campaignId: campaign.id, campaignName: campaign.name, newRecipients: newSupps.length });
    } catch (err) {
      logger.error({ err, campaignId: campaign.id }, 'Campaign evaluation failed');
      results.push({ campaignId: campaign.id, campaignName: campaign.name, newRecipients: 0 });
    }
  }

  return results;
}
