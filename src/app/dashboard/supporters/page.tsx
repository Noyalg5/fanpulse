import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { prisma, getClubId } from '@/lib/db';
import { Th, SectionHeading } from '../_lib/ui';
import { SupportersFilters } from './_components/SupportersFilters';
import { SupportersTable } from './_components/SupportersTable';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const VALID_SEGMENTS = new Set([
  'champion', 'loyal', 'potential_loyalist', 'new_fan',
  'at_risk', 'lapsed', 'casual', 'hibernating',
]);

async function getSupporters(q: string | undefined, segment: string | undefined, page: number) {
  const clubId = getClubId();
  const where: Prisma.SupporterWhereInput = {
    clubId,
    ...(q && {
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName:  { contains: q, mode: 'insensitive' } },
        { email:     { contains: q, mode: 'insensitive' } },
      ],
    }),
    ...(segment && VALID_SEGMENTS.has(segment) && { segment }),
  };

  const skip = (page - 1) * PAGE_SIZE;

  const [supporters, total] = await Promise.all([
    prisma.supporter.findMany({
      where,
      orderBy: { engagementScore: 'desc' },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        segment: true,
        engagementScore: true,
        lifetimeValue: true,
        events: {
          orderBy: { eventDate: 'desc' },
          take: 1,
          select: { eventDate: true },
        },
      },
    }),
    prisma.supporter.count({ where }),
  ]);

  return { supporters, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

// Build a URL that preserves other params when one changes
function buildUrl(params: {
  q?: string;
  segment?: string;
  page?: number;
}) {
  const p = new URLSearchParams();
  if (params.q) p.set('q', params.q);
  if (params.segment) p.set('segment', params.segment);
  if (params.page && params.page > 1) p.set('page', String(params.page));
  const qs = p.toString();
  return `/dashboard/supporters${qs ? '?' + qs : ''}`;
}

export default async function SupportersPage({
  searchParams,
}: {
  searchParams: { q?: string; segment?: string; page?: string };
}) {
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() || undefined : undefined;
  const segment = typeof searchParams.segment === 'string' ? searchParams.segment || undefined : undefined;
  const page = Math.max(1, parseInt(typeof searchParams.page === 'string' ? searchParams.page : '1', 10) || 1);

  const { supporters, total, totalPages } = await getSupporters(q, segment, page);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">

      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Supporters</h1>
        <p className="mt-1 text-sm text-gray-500">{total.toLocaleString()} supporters</p>
      </div>

      {/* Filters */}
      <SupportersFilters q={q} segment={segment} />

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Segment</Th>
                <Th right>Engagement</Th>
                <Th right>Lifetime Value</Th>
                <Th right>Last Active</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <SupportersTable supporters={supporters} />
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
          <p className="text-sm text-gray-500">
            {total === 0
              ? 'No results'
              : `Page ${page} of ${totalPages} · ${total.toLocaleString()} results`}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={buildUrl({ q, segment, page: page - 1 })}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Previous
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-md border border-gray-100 px-3 py-1.5 text-sm font-medium text-gray-300">
                Previous
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={buildUrl({ q, segment, page: page + 1 })}
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
      </div>

    </main>
  );
}
