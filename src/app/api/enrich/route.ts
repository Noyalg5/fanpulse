// POST /api/enrich — manual trigger
// GET  /api/enrich — Vercel cron trigger (runs nightly at 03:00 UTC)

import { NextRequest, NextResponse } from 'next/server';
import { runEnrichment } from '@/lib/enrichment/scoring';
import { isAuthorized } from '@/lib/authUtils';

export async function POST(request: NextRequest) {
  if (!isAuthorized(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runEnrichment();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Vercel cron sends GET
export async function GET(request: NextRequest) {
  if (!isAuthorized(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runEnrichment();
    return NextResponse.json({ success: true, trigger: 'cron', ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
