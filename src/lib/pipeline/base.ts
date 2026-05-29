// ─────────────────────────────────────────────
// FanPulse — Base Pipeline Adapter
//
// Every data source (ticketing, membership, etc.) extends this class.
// The ETL pattern is: extract() → transform() → load()
//
// MULTI-TENANCY: every Prisma query must include clubId.
// All create/upsert calls receive clubId from getClubId().
// All where clauses include clubId to prevent cross-club data access.
// ─────────────────────────────────────────────

import { Prisma } from '@prisma/client';
import { prisma, getClubId } from '@/lib/db';
import { pipelineLogger } from '@/lib/logger';
import type {
  DataSource,
  RawRecord,
  NormalisedSupporter,
  NormalisedEvent,
  NormalisedMembership,
  LoadResult,
  PipelineRunResult,
} from '@/types';

export abstract class BaseAdapter {
  abstract readonly source: DataSource;
  private _log?: ReturnType<typeof pipelineLogger>;
  protected get log() { return (this._log ??= pipelineLogger(this.source)); }

  // ── To implement in subclasses ──────────────────

  abstract extract(): Promise<RawRecord[]>;

  abstract transform(raw: RawRecord[]): Promise<{
    supporters: NormalisedSupporter[];
    events: NormalisedEvent[];
    memberships?: NormalisedMembership[];
  }>;

  // ── Provided by base class ───────────────────────

  async load(data: {
    supporters: NormalisedSupporter[];
    events: NormalisedEvent[];
    memberships?: NormalisedMembership[];
  }): Promise<LoadResult> {
    const clubId = getClubId();
    const result: LoadResult = { processed: 0, created: 0, updated: 0, failed: 0, errors: [] };

    // 1. Upsert supporters — scoped to this club; email is unique per club
    for (const s of data.supporters) {
      try {
        const existing = await prisma.supporter.findUnique({
          where: { clubId_email: { clubId, email: s.email } },
        });
        await prisma.supporter.upsert({
          where: { clubId_email: { clubId, email: s.email } },
          create: {
            clubId,
            email: s.email,
            firstName: s.firstName,
            lastName: s.lastName,
            phone: s.phone,
            postcode: s.postcode,
            dateOfBirth: s.dateOfBirth,
            gender: s.gender,
            emailConsent: s.emailConsent ?? false,
            smsConsent: s.smsConsent ?? false,
            consentDate: s.consentDate,
            consentSource: s.consentSource,
            externalIds: s.externalIds ?? {},
          },
          update: {
            ...(s.firstName && { firstName: s.firstName }),
            ...(s.lastName && { lastName: s.lastName }),
            ...(s.phone && { phone: s.phone }),
            ...(s.postcode && { postcode: s.postcode }),
            ...(s.dateOfBirth && { dateOfBirth: s.dateOfBirth }),
            // Only upgrade consent, never downgrade
            ...(s.emailConsent === true && { emailConsent: true }),
            ...(s.smsConsent === true && { smsConsent: true }),
            ...(s.externalIds && {
              externalIds: {
                ...(existing?.externalIds as Record<string, string> ?? {}),
                ...s.externalIds,
              },
            }),
          },
        });
        existing ? result.updated++ : result.created++;
        result.processed++;
      } catch (err) {
        result.failed++;
        result.errors.push(`Supporter ${s.email}: ${String(err)}`);
        this.log.warn({ email: s.email, err }, 'Failed to upsert supporter');
      }
    }

    // 2. Upsert events — find supporter within this club, then upsert event
    for (const e of data.events) {
      try {
        const supporter = await prisma.supporter.findUnique({
          where: { clubId_email: { clubId, email: e.supporterEmail } },
        });
        if (!supporter) {
          result.errors.push(`Event for unknown supporter: ${e.supporterEmail}`);
          result.failed++;
          continue;
        }

        const dedupeKey = e.externalId ? `${e.source}:${e.externalId}` : undefined;

        if (dedupeKey) {
          await prisma.supporterEvent.upsert({
            where: { source_externalId: dedupeKey },
            create: {
              clubId,
              supporterId: supporter.id,
              source: e.source,
              eventType: e.eventType,
              eventDate: e.eventDate,
              value: e.value,
              metadata: (e.metadata ?? {}) as Prisma.InputJsonValue,
              externalId: e.externalId,
              source_externalId: dedupeKey,
            },
            update: {
              value: e.value,
              metadata: (e.metadata ?? {}) as Prisma.InputJsonValue,
            },
          });
        } else {
          await prisma.supporterEvent.create({
            data: {
              clubId,
              supporterId: supporter.id,
              source: e.source,
              eventType: e.eventType,
              eventDate: e.eventDate,
              value: e.value,
              metadata: (e.metadata ?? {}) as Prisma.InputJsonValue,
            },
          });
        }
        result.processed++;
        result.created++;
      } catch (err) {
        result.failed++;
        result.errors.push(`Event ${e.externalId ?? 'unknown'}: ${String(err)}`);
      }
    }

    // 3. Upsert memberships — same club scoping
    for (const m of data.memberships ?? []) {
      try {
        const supporter = await prisma.supporter.findUnique({
          where: { clubId_email: { clubId, email: m.supporterEmail } },
        });
        if (!supporter) continue;

        if (m.externalId) {
          await prisma.membership.upsert({
            where: { externalId: m.externalId },
            create: {
              clubId,
              supporterId: supporter.id,
              type: m.type,
              status: m.status,
              tier: m.tier,
              startDate: m.startDate,
              endDate: m.endDate,
              renewalDate: m.renewalDate,
              pricePaid: m.pricePaid,
              externalId: m.externalId,
            },
            update: {
              status: m.status,
              endDate: m.endDate,
              renewalDate: m.renewalDate,
            },
          });
        }
        result.processed++;
        result.created++;
      } catch (err) {
        result.failed++;
        result.errors.push(`Membership ${m.externalId}: ${String(err)}`);
      }
    }

    return result;
  }

  async run(): Promise<PipelineRunResult> {
    const clubId = getClubId();
    const startedAt = Date.now();
    this.log.info(`Starting ${this.source} pipeline`);

    const log = await prisma.ingestionLog.create({
      data: { clubId, source: this.source, status: 'running', startedAt: new Date() },
    });

    try {
      const raw = await this.extract();
      this.log.info({ count: raw.length }, 'Extraction complete');

      const transformed = await this.transform(raw);
      this.log.info(
        {
          supporters: transformed.supporters.length,
          events: transformed.events.length,
          memberships: transformed.memberships?.length ?? 0,
        },
        'Transformation complete',
      );

      const loadResult = await this.load(transformed);
      const durationMs = Date.now() - startedAt;

      const status = loadResult.failed === 0
        ? 'success'
        : loadResult.failed < loadResult.processed
          ? 'partial'
          : 'failed';

      await prisma.ingestionLog.update({
        where: { id: log.id },
        data: {
          status,
          completedAt: new Date(),
          recordsProcessed: loadResult.processed,
          recordsCreated: loadResult.created,
          recordsUpdated: loadResult.updated,
          recordsFailed: loadResult.failed,
          metadata: { errors: loadResult.errors.slice(0, 20) },
        },
      });

      await prisma.dataSourceConfig.upsert({
        where: { clubId_source: { clubId, source: this.source } },
        create: { clubId, source: this.source, lastSyncAt: new Date() },
        update: { lastSyncAt: new Date() },
      });

      this.log.info({ status, durationMs, ...loadResult }, `${this.source} pipeline complete`);

      return { source: this.source, status, logId: log.id, durationMs, ...loadResult };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const errorMessage = String(err);

      await prisma.ingestionLog.update({
        where: { id: log.id },
        data: { status: 'failed', completedAt: new Date(), errorMessage },
      });

      this.log.error({ err, durationMs }, `${this.source} pipeline failed`);

      return {
        source: this.source,
        status: 'failed',
        logId: log.id,
        durationMs,
        processed: 0,
        created: 0,
        updated: 0,
        failed: 0,
        error: errorMessage,
      };
    }
  }
}
