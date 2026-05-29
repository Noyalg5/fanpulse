import { prisma, getClubId } from '@/lib/db';
import {
  SEGMENT_META,
  fmtGBP,
  fmtRelative,
  SectionHeading,
  Th,
  StatCard,
  SegmentBadge,
  ScoreBar,
} from './_lib/ui';
import { EvaluateButton } from './_components/EvaluateButton';
import { evaluateTriggeredCampaigns } from '@/lib/campaigns/engine';

export const dynamic = 'force-dynamic';

// ── Constants (overview-only) ──────────────────────────────────

const SOURCES = ['ticketing', 'membership', 'ecommerce', 'social'] as const;

const STATUS_META: Record<string, { dot: string; text: string; label: string }> = {
  success:   { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Success' },
  partial:   { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Partial' },
  failed:    { dot: 'bg-red-500',     text: 'text-red-700',     label: 'Failed' },
  running:   { dot: 'bg-blue-500',    text: 'text-blue-700',    label: 'Running' },
  never_run: { dot: 'bg-gray-300',    text: 'text-gray-400',    label: 'Never run' },
};

const ORDERED_SEGMENTS = [
  'champion', 'loyal', 'potential_loyalist', 'new_fan',
  'at_risk', 'lapsed', 'casual', 'hibernating',
];

// ── Data fetching ──────────────────────────────────────────────

async function getDashboardData() {
  const clubId = getClubId();

  const [
    totalSupporters,
    segmentGroups,
    topSupporters,
    ltvAggregate,
    sourceConfigs,
    recentLogs,
    campaigns,
    recipientGroups,
  ] = await Promise.all([
    prisma.supporter.count({ where: { clubId } }),
    prisma.supporter.groupBy({
      by: ['segment'],
      where: { clubId },
      _count: { id: true },
    }),
    prisma.supporter.findMany({
      where: { clubId },
      orderBy: { engagementScore: 'desc' },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        segment: true,
        engagementScore: true,
        lifetimeValue: true,
        churnRisk: true,
      },
    }),
    prisma.supporter.aggregate({
      where: { clubId },
      _sum: { lifetimeValue: true },
    }),
    prisma.dataSourceConfig.findMany({ where: { clubId } }),
    prisma.ingestionLog.findMany({
      where: { clubId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    }),
    prisma.campaign.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, channel: true, type: true, status: true },
    }),
    prisma.campaignRecipient.groupBy({
      by: ['campaignId', 'status'],
      where: { campaign: { clubId } },
      _count: { id: true },
    }),
  ]);

  const segmentMap = Object.fromEntries(
    segmentGroups.map((g) => [g.segment ?? 'unsegmented', g._count.id]),
  ) as Record<string, number>;

  const pipeline = SOURCES.map((source) => {
    const config = sourceConfigs.find((c) => c.source === source);
    const lastRun = recentLogs.find((r) => r.source === source);
    return {
      source,
      enabled: config?.enabled ?? true,
      lastSyncAt: config?.lastSyncAt ?? null,
      lastRunStatus: lastRun?.status ?? 'never_run',
      lastRunAt: lastRun?.startedAt ?? null,
      recordsProcessed: lastRun?.recordsProcessed ?? 0,
      recordsFailed: lastRun?.recordsFailed ?? 0,
    };
  });

  const campaignData = campaigns.map((c) => {
    const groups = recipientGroups.filter((g) => g.campaignId === c.id);
    const pending = groups.find((g) => g.status === 'pending')?._count.id ?? 0;
    const sent    = groups.find((g) => g.status === 'sent')?._count.id    ?? 0;
    return { ...c, pending, sent };
  });

  return {
    totalSupporters,
    segmentMap,
    topSupporters,
    totalLTV: ltvAggregate._sum.lifetimeValue ?? 0,
    champions: segmentMap['champion'] ?? 0,
    atRisk: segmentMap['at_risk'] ?? 0,
    pipeline,
    recentRuns: recentLogs.slice(0, 5),
    campaigns: campaignData,
  };
}

// ── Page ───────────────────────────────────────────────────────

const CAMPAIGN_STATUS: Record<string, { dot: string; text: string; label: string }> = {
  draft:     { dot: 'bg-gray-300',    text: 'text-gray-500',    label: 'Draft' },
  active:    { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Active' },
  paused:    { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Paused' },
  completed: { dot: 'bg-blue-400',    text: 'text-blue-700',    label: 'Completed' },
};

const CHANNEL_ICON: Record<string, string> = {
  email:      '📧',
  sms:        '📱',
  push:       '🔔',
  social_ad:  '📣',
};

export default async function DashboardPage() {
  async function evaluateAction() {
    'use server';
    return evaluateTriggeredCampaigns();
  }

  const data = await getDashboardData();
  const maxSegmentCount = Math.max(...Object.values(data.segmentMap), 1);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Supporters" value={data.totalSupporters.toLocaleString()} />
        <StatCard label="Lifetime Value" value={fmtGBP(data.totalLTV)} />
        <StatCard label="Champions" value={String(data.champions)} accent="green" />
        <StatCard label="At Risk" value={String(data.atRisk)} accent="amber" />
      </div>

      {/* Segments + Pipeline */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Segment breakdown */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <SectionHeading>Supporters by Segment</SectionHeading>
          <div className="mt-4 space-y-3">
            {ORDERED_SEGMENTS.map((seg) => {
              const count = data.segmentMap[seg] ?? 0;
              const pct = Math.round((count / maxSegmentCount) * 100);
              const meta = SEGMENT_META[seg];
              return (
                <div key={seg} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-sm text-gray-600">{meta.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${meta.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-medium text-gray-700">
                    {count}
                  </span>
                </div>
              );
            })}
            {Object.keys(data.segmentMap).length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">
                No segments yet — run enrichment to score supporters.
              </p>
            )}
          </div>
        </div>

        {/* Pipeline status */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <SectionHeading>Pipeline Status</SectionHeading>
          <div className="mt-4 divide-y divide-gray-50">
            {data.pipeline.map((src) => {
              const status = STATUS_META[src.lastRunStatus] ?? STATUS_META['never_run'];
              return (
                <div key={src.source} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium capitalize text-gray-900">{src.source}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {src.lastRunAt ? `Last run ${fmtRelative(src.lastRunAt)}` : 'Never synced'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="flex items-center justify-end gap-1.5">
                      <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
                      <span className={`text-sm font-medium ${status.text}`}>{status.label}</span>
                    </span>
                    {src.recordsProcessed > 0 && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        {src.recordsProcessed.toLocaleString()} records
                        {src.recordsFailed > 0 && (
                          <span className="text-red-500"> · {src.recordsFailed} failed</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top supporters */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <SectionHeading>Top 5 Supporters by Engagement</SectionHeading>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <Th>Name</Th>
                <Th>Segment</Th>
                <Th right>Engagement</Th>
                <Th right>Lifetime Value</Th>
                <Th right>Churn Risk</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.topSupporters.map((s) => {
                const name = s.firstName && s.lastName ? `${s.firstName} ${s.lastName}` : null;
                const churnPct = Math.round(s.churnRisk * 100);
                return (
                  <tr key={s.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-900">{name ?? s.email}</p>
                      {name && <p className="mt-0.5 text-xs text-gray-400">{s.email}</p>}
                    </td>
                    <td className="px-6 py-3"><SegmentBadge segment={s.segment} /></td>
                    <td className="px-6 py-3"><ScoreBar score={s.engagementScore} /></td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900">
                      {fmtGBP(s.lifetimeValue)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className={`font-medium ${churnPct >= 60 ? 'text-red-600' : churnPct >= 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {churnPct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
              {data.topSupporters.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                    No supporter data yet — run the pipeline to ingest records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent pipeline runs */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <SectionHeading>Recent Pipeline Runs</SectionHeading>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <Th>Source</Th>
                <Th>Status</Th>
                <Th right>Processed</Th>
                <Th right>Created</Th>
                <Th right>Updated</Th>
                <Th right>Failed</Th>
                <Th right>Started</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.recentRuns.map((run) => {
                const status = STATUS_META[run.status] ?? STATUS_META['never_run'];
                return (
                  <tr key={run.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium capitalize text-gray-900">{run.source}</td>
                    <td className="px-6 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
                        <span className={`font-medium ${status.text}`}>{status.label}</span>
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700">{run.recordsProcessed.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-emerald-600">{run.recordsCreated.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-blue-600">{run.recordsUpdated.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={run.recordsFailed > 0 ? 'text-red-600' : 'text-gray-400'}>
                        {run.recordsFailed.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-400">{fmtRelative(run.startedAt)}</td>
                  </tr>
                );
              })}
              {data.recentRuns.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-400">
                    No pipeline runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaigns */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <SectionHeading>Campaigns</SectionHeading>
          <EvaluateButton onEvaluate={evaluateAction} />
        </div>

        {data.campaigns.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-400">No campaigns yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              To add a test campaign, open{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-600">
                npm run db:studio
              </code>{' '}
              and insert a row in the Campaign table with{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-600">
                type&nbsp;=&nbsp;&quot;triggered&quot;
              </code>{' '}
              and{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-600">
                status&nbsp;=&nbsp;&quot;active&quot;
              </code>.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <Th>Name</Th>
                    <Th>Channel</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th right>Pending</Th>
                    <Th right>Sent</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.campaigns.map((c) => {
                    const status = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS['draft'];
                    return (
                      <tr key={c.id} className="transition-colors hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{c.name}</td>
                        <td className="px-6 py-3 text-gray-600">
                          <span className="flex items-center gap-1.5">
                            <span>{CHANNEL_ICON[c.channel] ?? '•'}</span>
                            <span className="capitalize">{c.channel}</span>
                          </span>
                        </td>
                        <td className="px-6 py-3 capitalize text-gray-600">{c.type.replace('_', ' ')}</td>
                        <td className="px-6 py-3">
                          <span className="flex items-center gap-1.5">
                            <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
                            <span className={`font-medium ${status.text}`}>{status.label}</span>
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right text-amber-600">{c.pending}</td>
                        <td className="px-6 py-3 text-right text-emerald-600">{c.sent}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
              <p className="text-xs text-gray-400">
                💡 To add a test campaign, open{' '}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-gray-600 ring-1 ring-gray-200">
                  npm run db:studio
                </code>{' '}
                and insert a row in the Campaign table with{' '}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-gray-600 ring-1 ring-gray-200">
                  type = "triggered"
                </code>,{' '}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-gray-600 ring-1 ring-gray-200">
                  status = "active"
                </code>, and a{' '}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-gray-600 ring-1 ring-gray-200">
                  triggerConfig
                </code>{' '}
                JSON object. Then click Evaluate Now.
              </p>
            </div>
          </>
        )}
      </div>

    </main>
  );
}
