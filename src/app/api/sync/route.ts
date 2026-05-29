// POST /api/sync  — manual trigger (curl / dashboard button)
// GET  /api/sync  — Vercel cron trigger (runs full pipeline nightly at 02:00 UTC)
//
// Both accept: Authorization: Bearer PIPELINE_SECRET  (manual)
//              Authorization: Bearer CRON_SECRET       (Vercel cron — injected automatically)

import { NextRequest, NextResponse } from 'next/server';
import { runPipeline } from '@/lib/pipeline';
import { isAuthorized } from '@/lib/authUtils';
import type { DataSource } from '@/types';

const ALL_SOURCES: DataSource[] = ['ticketing', 'membership', 'ecommerce', 'social'];

export async function POST(request: NextRequest) {
  if (!isAuthorized(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const sources = (body.sources as DataSource[]) ?? ALL_SOURCES;
    const parallel = Boolean(body.parallel ?? false);

    const results = await runPipeline(sources, parallel);

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        succeeded: results.filter((r) => r.status === 'success').length,
        failed: results.filter((r) => r.status === 'failed').length,
        totalProcessed: results.reduce((s, r) => s + r.processed, 0),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Vercel cron sends GET — run full pipeline with all sources
export async function GET(request: NextRequest) {
  if (!isAuthorized(request.headers.get('Authorization'))) {
    // Unauthenticated GET = health check only
    return NextResponse.json({
      status: 'ok',
      message: 'FanPulse pipeline endpoint. POST (or authenticated GET) to trigger a sync.',
      availableSources: ALL_SOURCES,
    });
  }

  try {
    const results = await runPipeline(ALL_SOURCES, false);
    return NextResponse.json({
      success: true,
      trigger: 'cron',
      results,
      summary: {
        total: results.length,
        succeeded: results.filter((r) => r.status === 'success').length,
        failed: results.filter((r) => r.status === 'failed').length,
        totalProcessed: results.reduce((s, r) => s + r.processed, 0),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
