'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';

const SEGMENT_OPTIONS = [
  { value: '',                   label: 'All Segments' },
  { value: 'champion',           label: 'Champion' },
  { value: 'loyal',              label: 'Loyal' },
  { value: 'potential_loyalist', label: 'Potential Loyalist' },
  { value: 'new_fan',            label: 'New Fan' },
  { value: 'at_risk',            label: 'At Risk' },
  { value: 'lapsed',             label: 'Lapsed' },
  { value: 'casual',             label: 'Casual' },
  { value: 'hibernating',        label: 'Hibernating' },
];

export function SupportersFilters({ q, segment }: { q?: string; segment?: string }) {
  const router = useRouter();
  const debounceRef = useRef<number | null>(null);

  function navigate(newQ: string | undefined, newSeg: string | undefined) {
    const params = new URLSearchParams();
    if (newQ) params.set('q', newQ);
    if (newSeg) params.set('segment', newSeg);
    const qs = params.toString();
    router.push(`/dashboard/supporters${qs ? '?' + qs : ''}`);
  }

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      navigate(value.trim() || undefined, segment);
    }, 400);
  }

  function handleSegment(e: React.ChangeEvent<HTMLSelectElement>) {
    navigate(q, e.target.value || undefined);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <input
        type="search"
        placeholder="Search by name or email…"
        defaultValue={q ?? ''}
        onChange={handleSearch}
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none sm:max-w-xs"
      />
      <select
        value={segment ?? ''}
        onChange={handleSegment}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
      >
        {SEGMENT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
