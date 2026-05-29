import { NextResponse } from 'next/server';
import { prisma, getClubId } from '@/lib/db';

export async function GET() {
  try {
    const clubId = getClubId();

    const [campaigns, recipientGroups] = await Promise.all([
      prisma.campaign.findMany({
        where: { clubId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          channel: true,
          type: true,
          status: true,
          triggerConfig: true,
          sentAt: true,
          createdAt: true,
        },
      }),
      prisma.campaignRecipient.groupBy({
        by: ['campaignId', 'status'],
        where: { campaign: { clubId } },
        _count: { id: true },
      }),
    ]);

    const data = campaigns.map((c) => {
      const groups = recipientGroups.filter((g) => g.campaignId === c.id);
      const total   = groups.reduce((sum, g) => sum + g._count.id, 0);
      const pending = groups.find((g) => g.status === 'pending')?._count.id  ?? 0;
      const sent    = groups.find((g) => g.status === 'sent')?._count.id     ?? 0;
      const opened  = groups.find((g) => g.status === 'opened')?._count.id   ?? 0;
      const clicked = groups.find((g) => g.status === 'clicked')?._count.id  ?? 0;
      return { ...c, recipients: { total, pending, sent, opened, clicked } };
    });

    return NextResponse.json({ campaigns: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
