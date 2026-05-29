import { type ReactNode } from 'react';
import { formatDistanceToNow, format } from 'date-fns';

export const SEGMENT_META: Record<string, { label: string; bar: string; badge: string }> = {
  champion:           { label: 'Champion',           bar: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-800' },
  loyal:              { label: 'Loyal',              bar: 'bg-emerald-300', badge: 'bg-blue-100 text-blue-800' },
  potential_loyalist: { label: 'Potential Loyalist', bar: 'bg-emerald-200', badge: 'bg-cyan-100 text-cyan-800' },
  new_fan:            { label: 'New Fan',            bar: 'bg-violet-300',  badge: 'bg-violet-100 text-violet-800' },
  at_risk:            { label: 'At Risk',            bar: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-800' },
  lapsed:             { label: 'Lapsed',             bar: 'bg-orange-400',  badge: 'bg-orange-100 text-orange-800' },
  casual:             { label: 'Casual',             bar: 'bg-gray-300',    badge: 'bg-gray-100 text-gray-700' },
  hibernating:        { label: 'Hibernating',        bar: 'bg-red-300',     badge: 'bg-red-100 text-red-800' },
};

export function fmtGBP(n: number): string {
  return '£' + n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

export function fmtGBP2(n: number): string {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtRelative(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return formatDistanceToNow(new Date(d), { addSuffix: true });
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return format(new Date(d), 'd MMM yyyy');
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{children}</h2>
  );
}

export function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={`px-6 py-3 text-xs font-medium uppercase tracking-wide text-gray-400 ${right ? 'text-right' : ''}`}>
      {children}
    </th>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'green' | 'amber' | 'red';
}) {
  return (
    <div className={`rounded-lg border bg-white p-5 ${
      accent === 'green' ? 'border-emerald-200' :
      accent === 'amber' ? 'border-amber-200' :
      accent === 'red'   ? 'border-red-200' :
      'border-gray-200'
    }`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${
        accent === 'green' ? 'text-emerald-700' :
        accent === 'amber' ? 'text-amber-700' :
        accent === 'red'   ? 'text-red-700' :
        'text-gray-900'
      }`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export function SegmentBadge({ segment }: { segment: string | null }) {
  const meta = segment ? SEGMENT_META[segment] : null;
  if (!meta) return <span className="text-sm text-gray-400">—</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
      {meta.label}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${
            score >= 70 ? 'bg-emerald-400' : score >= 40 ? 'bg-amber-400' : 'bg-gray-300'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right text-sm font-medium text-gray-700">
        {(Math.round(score * 10) / 10).toFixed(1)}
      </span>
    </div>
  );
}

export function ScoreBarLabelled({ label, score }: { label: string; score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="flex items-center gap-4">
      <span className="w-28 shrink-0 text-sm text-gray-600">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${
            score >= 70 ? 'bg-emerald-400' : score >= 40 ? 'bg-amber-400' : 'bg-red-300'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-sm font-medium text-gray-700">
        {(Math.round(score * 10) / 10).toFixed(1)}
      </span>
    </div>
  );
}
