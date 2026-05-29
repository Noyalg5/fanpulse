'use client';

import { useRouter } from 'next/navigation';
import { SegmentBadge, ScoreBar, fmtGBP2, fmtRelative } from '../../_lib/ui';

export type SupporterRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  segment: string | null;
  engagementScore: number;
  lifetimeValue: number;
  events: { eventDate: Date | string }[];
};

export function SupportersTable({ supporters }: { supporters: SupporterRow[] }) {
  const router = useRouter();

  if (supporters.length === 0) {
    return (
      <tr>
        <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
          No supporters found matching your filters.
        </td>
      </tr>
    );
  }

  return (
    <>
      {supporters.map((s) => {
        const name =
          s.firstName && s.lastName ? `${s.firstName} ${s.lastName}` : null;
        const lastActive = s.events[0]?.eventDate ?? null;

        return (
          <tr
            key={s.id}
            className="cursor-pointer transition-colors hover:bg-gray-50"
            onClick={() => router.push(`/dashboard/supporters/${s.id}`)}
          >
            <td className="px-6 py-3">
              <p className="font-medium text-gray-900">{name ?? '—'}</p>
            </td>
            <td className="px-6 py-3 text-sm text-gray-600">{s.email}</td>
            <td className="px-6 py-3">
              <SegmentBadge segment={s.segment} />
            </td>
            <td className="px-6 py-3">
              <ScoreBar score={s.engagementScore} />
            </td>
            <td className="px-6 py-3 text-right text-sm font-medium text-gray-900">
              {fmtGBP2(s.lifetimeValue)}
            </td>
            <td className="px-6 py-3 text-right text-sm text-gray-400">
              {fmtRelative(lastActive)}
            </td>
          </tr>
        );
      })}
    </>
  );
}
