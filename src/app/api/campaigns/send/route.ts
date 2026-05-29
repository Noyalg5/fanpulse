// POST /api/campaigns/send — manual trigger
// GET  /api/campaigns/send — Vercel cron trigger (runs nightly at 04:00 UTC)

import { NextRequest, NextResponse } from 'next/server';
import { sendPendingEmails } from '@/lib/campaigns/emailSender';
import { isAuthorized } from '@/lib/authUtils';

export async function POST(request: NextRequest) {
  if (!isAuthorized(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendPendingEmails();
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
    const result = await sendPendingEmails();
    return NextResponse.json({ success: true, trigger: 'cron', ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
