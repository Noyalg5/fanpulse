// POST /api/campaigns/evaluate — manual trigger
// GET  /api/campaigns/evaluate — Vercel cron trigger (runs nightly at 03:30 UTC)

import { NextRequest, NextResponse } from 'next/server';
import { evaluateTriggeredCampaigns } from '@/lib/campaigns/engine';
import { isAuthorized } from '@/lib/authUtils';

export async function POST(request: NextRequest) {
  if (!isAuthorized(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await evaluateTriggeredCampaigns();
    const totalNewRecipients = results.reduce((sum, r) => sum + r.newRecipients, 0);
    return NextResponse.json({ success: true, results, totalNewRecipients });
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
    const results = await evaluateTriggeredCampaigns();
    const totalNewRecipients = results.reduce((sum, r) => sum + r.newRecipients, 0);
    return NextResponse.json({ success: true, trigger: 'cron', results, totalNewRecipients });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
