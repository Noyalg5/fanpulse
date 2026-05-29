'use client';

import { useState, useTransition } from 'react';

type EvalResult = {
  campaignId: string;
  campaignName: string;
  newRecipients: number;
};

export function EvaluateButton({
  onEvaluate,
}: {
  onEvaluate: () => Promise<EvalResult[]>;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ total: number; ran: boolean } | null>(null);

  function handleClick() {
    startTransition(async () => {
      const data = await onEvaluate();
      const total = data.reduce((sum, r) => sum + r.newRecipients, 0);
      setResult({ total, ran: true });
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={isPending}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          isPending
            ? 'cursor-not-allowed bg-gray-100 text-gray-400'
            : 'bg-indigo-600 text-white hover:bg-indigo-700'
        }`}
      >
        {isPending ? 'Evaluating…' : 'Evaluate Now'}
      </button>
      {result?.ran && (
        <span className="text-sm text-gray-500">
          {result.total === 0
            ? 'No new recipients found'
            : `${result.total} new recipient${result.total !== 1 ? 's' : ''} queued`}
        </span>
      )}
    </div>
  );
}
