import Link from 'next/link';
import { notFound } from 'next/navigation';
import { differenceInDays } from 'date-fns';
import { prisma, getClubId } from '@/lib/db';
import {
  fmtGBP2,
  fmtDate,
  fmtRelative,
  StatCard,
  SegmentBadge,
  ScoreBarLabelled,
  SectionHeading,
} from '../../_lib/ui';

export const dynamic = 'force-dynamic';

const EVENT_PAGE_SIZE = 10;

const SOURCE_ICON: Record<string, string> = {
  ticketing:  '🎟',
  ecommerce:  '🛍',
  membership: '👤',
  social:     '📱',
  website:    '🌐',
  email:      '📧',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  ticket_purchased:     'Ticket purchased',
  match_attended:       'Match attended',
  ticket_refunded:      'Ticket refunded',
  ticket_transferred:   'Ticket transferred',
  merch_purchased:      'Merch purchased',
  cart_abandoned:       'Cart abandoned',
  membership_joined:    'Membership joined',
  membership_renewed:   'Membership renewed',
  membership_lapsed:    'Membership lapsed',
  membership_cancelled: 'Membership cancelled',
  post_liked:           'Post liked',
  post_shared:          'Post shared',
  comment_made:         'Comment made',
  page_viewed:          'Page viewed',
  video_watched:        'Video watched',
  form_submitted:       'Form submitted',
  email_opened:         'Email opened',
  email_clicked:        'Email clicked',
  email_bounced:        'Email bounced',
  email_unsubscribed:   'Email unsubscribed',
};

const MEMBERSHIP_TYPE_LABELS: Record<string, string> = {
  season_ticket:   'Season Ticket',
  junior_bairn:    'Junior Bairn',
  fss_member:      'FSS Member',
  patron:          'Patron',
  club_membership: 'Club Membership',
};

function fmtEventType(type: string): string {
  return EVENT_TYPE_LABELS[type] ??
    type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtMembershipType(type: string): string {
  return MEMBERSHIP_TYPE_LABELS[type] ??
    type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Data fetching ──────────────────────────────────────────────

async function getSupporterDetail(id: string, eventPage: number) {
  const clubId = getClubId();
  const skip = (eventPage - 1) * EVENT_PAGE_SIZE;

  const [supporter, totalEvents, mostRecentEvent] = await Promise.all([
    prisma.supporter.findFirst({
      where: { id, clubId },
      include: {
        memberships: { orderBy: { startDate: 'desc' } },
        events: {
          orderBy: { eventDate: 'desc' },
          skip,
          take: EVENT_PAGE_SIZE,
        },
      },
    }),
    prisma.supporterEvent.count({ where: { supporterId: id, clubId } }),
    prisma.supporterEvent.findFirst({
      where: { supporterId: id, clubId },
      orderBy: { eventDate: 'desc' },
      select: { eventDate: true },
    }),
  ]);

  return { supporter, totalEvents, mostRecentEvent };
}

// ── Page ───────────────────────────────────────────────────────

export default async function SupporterDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { eventPage?: string };
}) {
  const rawEventPage = typeof searchParams.eventPage === 'string' ? searchParams.eventPage : '1';
  const eventPage = Math.max(1, parseInt(rawEventPage, 10) || 1);

  const { supporter, totalEvents, mostRecentEvent } = await getSupporterDetail(params.id, eventPage);

  if (!supporter) notFound();

  const totalEventPages = Math.max(1, Math.ceil(totalEvents / EVENT_PAGE_SIZE));

  const daysSinceActive = mostRecentEvent?.eventDate
    ? differenceInDays(new Date(), new Date(mostRecentEvent.eventDate))
    : null;

  const churnPct = Math.round(supporter.churnRisk * 100);

  function eventPageUrl(p: number) {
    return `/dashboard/supporters/${supporter!.id}?eventPage=${p}`;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">

      {/* Back */}
      <Link
        href="/dashboard/supporters"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        ← Back to Supporters
      </Link>

      {/* Profile card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">
                {supporter.firstName && supporter.lastName
                  ? `${supporter.firstName} ${supporter.lastName}`
                  : supporter.email}
              </h1>
              <SegmentBadge segment={supporter.segment} />
            </div>
            <p className="text-sm text-gray-500">{supporter.email}</p>
            {(supporter.phone || supporter.postcode) && (
              <p className="text-sm text-gray-400">
                {[supporter.phone, supporter.postcode].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* Consent indicators */}
          <div className="flex items-center gap-4 shrink-0">
            <ConsentPill
              icon="✉"
              label="Email"
              granted={supporter.emailConsent}
            />
            <ConsentPill
              icon="📱"
              label="SMS"
              granted={supporter.smsConsent}
            />
          </div>
        </div>
        {supporter.consentDate && (
          <p className="mt-3 text-xs text-gray-400">
            Consent recorded {fmtDate(supporter.consentDate)}
            {supporter.consentSource && ` via ${supporter.consentSource}`}
          </p>
        )}
      </div>

      {/* Engagement metrics */}
      <div>
        <SectionHeading>Engagement Metrics</SectionHeading>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Engagement Score"
            value={(Math.round(supporter.engagementScore * 10) / 10).toFixed(1)}
            sub="out of 100"
            accent={supporter.engagementScore >= 70 ? 'green' : supporter.engagementScore >= 40 ? undefined : undefined}
          />
          <StatCard
            label="Lifetime Value"
            value={fmtGBP2(supporter.lifetimeValue)}
          />
          <StatCard
            label="Churn Risk"
            value={`${churnPct}%`}
            accent={churnPct >= 60 ? 'red' : churnPct >= 30 ? 'amber' : 'green'}
          />
          <StatCard
            label="Days Since Active"
            value={daysSinceActive !== null ? String(daysSinceActive) : '—'}
            sub={daysSinceActive !== null ? 'days ago' : 'no events'}
          />
        </div>
      </div>

      {/* RFM score breakdown */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <SectionHeading>Score Breakdown</SectionHeading>
        <div className="mt-4 space-y-4">
          <ScoreBarLabelled label="Recency"   score={supporter.recencyScore} />
          <ScoreBarLabelled label="Frequency" score={supporter.frequencyScore} />
          <ScoreBarLabelled label="Monetary"  score={supporter.monetaryScore} />
        </div>
        {supporter.segmentedAt && (
          <p className="mt-4 text-xs text-gray-400">
            Last scored {fmtRelative(supporter.segmentedAt)}
          </p>
        )}
      </div>

      {/* Memberships */}
      {supporter.memberships.length > 0 && (
        <div>
          <SectionHeading>Memberships</SectionHeading>
          <div className="mt-3 space-y-3">
            {supporter.memberships.map((m) => (
              <div
                key={m.id}
                className="flex items-start justify-between rounded-lg border border-gray-200 bg-white px-5 py-4"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-gray-900">
                    {fmtMembershipType(m.type)}
                    {m.tier && <span className="ml-1.5 text-gray-400">· {m.tier}</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    {fmtDate(m.startDate)}
                    {m.endDate && ` → ${fmtDate(m.endDate)}`}
                    {m.pricePaid != null && ` · ${fmtGBP2(m.pricePaid)}`}
                  </p>
                </div>
                <MembershipStatusBadge status={m.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity timeline */}
      <div>
        <div className="flex items-baseline justify-between">
          <SectionHeading>Activity</SectionHeading>
          <span className="text-xs text-gray-400">{totalEvents.toLocaleString()} events</span>
        </div>

        {supporter.events.length === 0 ? (
          <div className="mt-3 rounded-lg border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-400">
            No events recorded yet.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white divide-y divide-gray-50">
            {supporter.events.map((e) => (
              <div key={e.id} className="flex items-center gap-4 px-5 py-3">
                <span className="text-lg w-6 shrink-0 text-center" role="img" aria-label={e.source}>
                  {SOURCE_ICON[e.source] ?? '●'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{fmtEventType(e.eventType)}</p>
                  <p className="text-xs text-gray-400 capitalize">{e.source}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-gray-500">{fmtDate(e.eventDate)}</p>
                  {e.value != null && (
                    <p className="text-xs font-medium text-emerald-600">{fmtGBP2(e.value)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Event pagination */}
        {totalEventPages > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {eventPage} of {totalEventPages}
            </p>
            <div className="flex gap-2">
              {eventPage > 1 ? (
                <Link
                  href={eventPageUrl(eventPage - 1)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Previous
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-md border border-gray-100 px-3 py-1.5 text-sm font-medium text-gray-300">
                  Previous
                </span>
              )}
              {eventPage < totalEventPages ? (
                <Link
                  href={eventPageUrl(eventPage + 1)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Next
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-md border border-gray-100 px-3 py-1.5 text-sm font-medium text-gray-300">
                  Next
                </span>
              )}
            </div>
          </div>
        )}
      </div>

    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function ConsentPill({ icon, label, granted }: { icon: string; label: string; granted: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
      granted ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'
    }`}>
      <span role="img" aria-label={label}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function MembershipStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:    'bg-emerald-100 text-emerald-800',
    pending:   'bg-blue-100 text-blue-800',
    expired:   'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
      styles[status] ?? 'bg-gray-100 text-gray-600'
    }`}>
      {label}
    </span>
  );
}
