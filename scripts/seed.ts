#!/usr/bin/env tsx
// FanPulse — Large realistic demo seed for KTP presentation
// Generates 200 supporters with full event history, memberships, campaigns, and logs.
// Run: npm run db:seed

import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { subDays } from 'date-fns';

const prisma = new PrismaClient();
const now = new Date();

// ── Name pools ────────────────────────────────────────────────────────────────

const MALE_FIRST   = ['James','Robert','William','John','David','Andrew','Scott',
  'Craig','Gary','Steven','Alan','Mark','Kevin','Paul','Michael',
  'Derek','Grant','Colin','Ross','Callum','Liam','Ryan','Connor','Lewis','Fraser'];
const FEMALE_FIRST = ['Sarah','Claire','Laura','Emma','Amy','Rachel','Lisa',
  'Karen','Susan','Julie','Nicola','Fiona','Gillian','Lynne','Donna',
  'Stacey','Heather','Morag','Catriona','Eilidh','Megan','Lauren','Kirsty','Gemma','Leanne'];
const LAST_NAMES   = ['McAllister','Wilson','Brown','Reid','Henderson','Murray',
  'Campbell','Stevenson','MacDonald','Robertson','Thomson','Anderson','Scott',
  'Taylor','Mitchell','Stewart','Hamilton','Graham','Ferguson','Morrison',
  'Bell','Wallace','Young','Patterson','Mackenzie'];
const DOMAINS      = ['gmail.com','hotmail.co.uk','outlook.com','yahoo.co.uk','btinternet.com'];
const POSTCODES    = ['FK1','FK1','FK2','FK2','FK3','FK4','FK5','FK7','FK10','EH6','EH10','EH14'];
const STANDS       = ['Main Stand','Family Stand','North Stand','South Terrace'];
const MERCH_ITEMS  = ['Home Kit','Away Kit','Scarf','Mug','Beanie Hat','Training Top','Kids Kit'];

// ── Fixtures ──────────────────────────────────────────────────────────────────
// 36 home fixtures = 12 opponents × 3 rounds, spread over last 400 days.
// Index 0 = oldest (400 days ago), index 35 = newest (3 days ago).
// Boundaries for enrichment segment logic (relative to today):
//   Hibernating: >365 days  → indices 0–3
//   Lapsed:    181–365 days → indices 4–19
//   At-risk:    91–180 days → indices 20–25
//   Recent:       <90 days  → indices 26–35

const FIXTURE_OFFSETS = [
  400,390,380,370,360,350,   // indices  0–5:  very old (hibernating territory)
  340,330,320,310,300,290,   // indices  6–11: old
  280,270,260,250,240,220,   // indices 12–17: upper lapsed
  200,185,170,155,140,125,   // indices 18–23: lower lapsed / at-risk
  110, 95, 80, 65, 50, 40,   // indices 24–29: at-risk / recent
   30, 21, 14, 10,  7,  3,   // indices 30–35: very recent
];

const OPPONENTS = [
  {code:'HEA',name:'Hearts'},  {code:'CEL',name:'Celtic'},
  {code:'RAN',name:'Rangers'}, {code:'ABE',name:'Aberdeen'},
  {code:'HIB',name:'Hibernian'},{code:'MOT',name:'Motherwell'},
  {code:'SMI',name:'St Mirren'},{code:'DUN',name:'Dundee'},
  {code:'ROC',name:'Ross County'},{code:'LIV',name:'Livingston'},
  {code:'STJ',name:'St Johnstone'},{code:'KIL',name:'Kilmarnock'},
];

// Build 36 fixture objects sorted oldest → newest
const FIXTURES = OPPONENTS
  .flatMap((opp, oppIdx) =>
    [0,1,2].map((round) => {
      const globalIdx = round * 12 + oppIdx;
      return {
        id:        `FAL-${opp.code}-0${round + 1}`,
        name:      `Falkirk vs ${opp.name}`,
        date:      subDays(now, FIXTURE_OFFSETS[globalIdx]),
        dayOffset: FIXTURE_OFFSETS[globalIdx],
      };
    })
  )
  .sort((a, b) => b.dayOffset - a.dayOffset); // index 0 = oldest

// ── Helpers ───────────────────────────────────────────────────────────────────

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => start + i);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return +(Math.random() * (max - min) + min).toFixed(2);
}

// ── Segment distribution (200 total) ─────────────────────────────────────────

const SEGMENT_GROUPS = [
  { segment: 'champion',           count: 20 },
  { segment: 'loyal',              count: 35 },
  { segment: 'potential_loyalist', count: 25 },
  { segment: 'new_fan',            count: 20 },
  { segment: 'at_risk',            count: 25 },
  { segment: 'lapsed',             count: 30 },
  { segment: 'casual',             count: 25 },
  { segment: 'hibernating',        count: 20 },
];

// Segment boundaries by supporter index
// champion:           0–19
// loyal:             20–54
// potential_loyalist: 55–79
// new_fan:            80–99
// at_risk:          100–124
// lapsed:           125–154
// casual:           155–179
// hibernating:      180–199
const SEGMENT_LIST = SEGMENT_GROUPS.flatMap(({ segment, count }) =>
  Array(count).fill(segment)
);

// ── Event count per segment ────────────────────────────────────────────────────

function numTickets(segment: string): number {
  const ranges: Record<string, [number, number]> = {
    champion:           [28, 36],
    loyal:              [15, 27],
    potential_loyalist: [ 8, 14],
    new_fan:            [ 1,  3],
    at_risk:            [ 5, 12],
    lapsed:             [ 2,  6],
    casual:             [ 2,  5],
    hibernating:        [ 1,  2],
  };
  const [min, max] = ranges[segment] ?? [1, 3];
  return Math.min(randInt(min, max), 36);
}

// ── Fixture selection per segment ─────────────────────────────────────────────
// Returns sorted fixture indices (0 = oldest, 35 = newest) consistent with the
// segment's recency constraints so enrichment assigns the right segment.

function getFixtureIndices(segment: string, count: number, sIdx: number): number[] {
  switch (segment) {
    case 'champion': {
      // Attend many including very recent (always include some from 30–35)
      const mustHave = shuffle(range(30, 36)).slice(0, Math.min(4, count));
      const rest     = shuffle(range(0, 30)).slice(0, Math.max(0, count - mustHave.length));
      return [...rest, ...mustHave].sort((a, b) => a - b);
    }
    case 'loyal': {
      const mustHave = shuffle(range(26, 36)).slice(0, Math.min(3, count));
      const rest     = shuffle(range(0, 26)).slice(0, Math.max(0, count - mustHave.length));
      return [...rest, ...mustHave].sort((a, b) => a - b);
    }
    case 'potential_loyalist':
      return shuffle(range(12, 36)).slice(0, count).sort((a, b) => a - b);

    case 'new_fan':
      // All events within last 60 days — use indices 28–35 (offsets 50–3 days)
      return shuffle(range(28, 36)).slice(0, Math.min(count, 8)).sort((a, b) => a - b);

    case 'at_risk': {
      // Last event in at-risk window (indices 20–25, offsets 95–170 days)
      const lastIdx = 20 + (sIdx % 6);
      const older   = shuffle(range(4, 20)).slice(0, Math.max(0, count - 1));
      return [...older, lastIdx].sort((a, b) => a - b);
    }
    case 'lapsed': {
      // Last event in lapsed window (indices 4–19, offsets 185–360 days)
      const lastIdx = 4 + (sIdx % 16);
      const older   = shuffle(range(0, lastIdx)).slice(0, Math.max(0, count - 1));
      return [...older, lastIdx].sort((a, b) => a - b);
    }
    case 'casual':
      // Spread through mid-season — last event 30–110 days ago
      return shuffle(range(10, 30)).slice(0, Math.min(count, 20)).sort((a, b) => a - b);

    case 'hibernating':
      // Only very old fixtures — offsets 370–400 days (indices 0–3)
      return shuffle(range(0, 4)).slice(0, Math.min(count, 4)).sort((a, b) => a - b);

    default:
      return shuffle(range(0, 36)).slice(0, count).sort((a, b) => a - b);
  }
}

// ── Merch probability per segment ─────────────────────────────────────────────

function merchChance(segment: string): number {
  return { champion: 0.80, loyal: 0.65, potential_loyalist: 0.45,
           new_fan: 0.30, at_risk: 0.25, lapsed: 0.15,
           casual: 0.20, hibernating: 0.10 }[segment] ?? 0.15;
}

// ── Main seed ─────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Seeding FanPulse database with 200 supporters…\n');

  // ── 1. Clear existing data (FK-safe order) ──────────────────────────────────
  await prisma.campaignRecipient.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.supporterEvent.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.supporter.deleteMany();
  await prisma.ingestionLog.deleteMany();
  await prisma.dataSourceConfig.deleteMany();
  await prisma.club.deleteMany();
  console.log('Cleared existing data.');

  // ── 2. Club ─────────────────────────────────────────────────────────────────
  const club = await prisma.club.create({
    data: { name: 'Falkirk FC', slug: 'falkirk-fc', primaryColour: '#1a237e' },
  });
  const clubId = club.id;
  console.log(`Created club: ${club.name}  (id: ${clubId})`);

  // ── 3. Data source configs ───────────────────────────────────────────────────
  const yesterday = subDays(now, 1);
  await prisma.dataSourceConfig.createMany({
    data: ['ticketing','membership','ecommerce','social'].map((source) => ({
      clubId, source, enabled: true, syncFrequency: 'daily',
      lastSyncAt: yesterday, config: {},
    })),
  });

  // ── 4. Supporters (200) ──────────────────────────────────────────────────────
  const usedEmails = new Set<string>();

  type SupporterMeta = { id: string; idx: number; segment: string };
  const supporterMeta: SupporterMeta[] = [];

  const allEvents:      Prisma.SupporterEventCreateManyInput[] = [];
  const allMemberships: Prisma.MembershipCreateManyInput[]     = [];

  for (let i = 0; i < 200; i++) {
    const segment  = SEGMENT_LIST[i];
    const isMale   = i % 2 === 0;
    const firstName = (isMale ? MALE_FIRST : FEMALE_FIRST)[i % 25];
    const lastName  = LAST_NAMES[(Math.floor(i / 2) + i * 3) % 25];
    const domain    = DOMAINS[i % 5];

    // Unique email — append index only on collision
    let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
    if (usedEmails.has(email)) {
      email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@${domain}`;
    }
    usedEmails.add(email);

    // Junior bairns (indices 155–174) need DOB post-2005
    const isJunior  = i >= 155 && i <= 174;
    const dobYear   = isJunior ? 2006 + (i % 8) : 1965 + (i % 41);
    const dobMonth  = String((i % 12) + 1).padStart(2, '0');
    const dobDay    = String((i % 28) + 1).padStart(2, '0');
    const dateOfBirth = new Date(`${dobYear}-${dobMonth}-${dobDay}`);

    const postcodeBase = POSTCODES[i % 12];
    const postcode = `${postcodeBase} ${(i % 9) + 1}${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 3) % 26))}`;
    const phone    = `077009${String(i).padStart(5, '0')}`;

    const emailConsent  = Math.random() < 0.85;
    const smsConsent    = Math.random() < 0.40;
    const consentSource = i % 5 < 3 ? 'ticketing_checkout' : 'membership_form';

    // Pre-set scores — enrichment will recompute, but these look good on first load
    const scoreRanges: Record<string, [number, number]> = {
      champion:           [80, 100], loyal:              [60, 79],
      potential_loyalist: [45,  59], new_fan:            [30, 44],
      at_risk:            [30,  50], lapsed:             [10, 25],
      casual:             [15,  35], hibernating:        [ 0, 10],
    };
    const [sMin, sMax] = scoreRanges[segment] ?? [0, 100];
    const engagementScore = randFloat(sMin, sMax);
    const churnRisk = segment === 'champion' ? randFloat(0.02, 0.10)
      : segment === 'loyal'             ? randFloat(0.05, 0.20)
      : segment === 'at_risk'           ? randFloat(0.40, 0.70)
      : segment === 'lapsed'            ? randFloat(0.60, 0.85)
      : segment === 'hibernating'       ? randFloat(0.80, 0.95)
      : randFloat(0.10, 0.50);

    const supporter = await prisma.supporter.create({
      data: {
        clubId, email, firstName, lastName, phone, postcode, dateOfBirth,
        emailConsent, smsConsent, consentSource,
        engagementScore, churnRisk,
        segment,
        segmentedAt: subDays(now, randInt(1, 5)), // recent segmentation
        externalIds: { ticketing: `TKT-${String(i).padStart(4,'0')}` },
      },
    });
    supporterMeta.push({ id: supporter.id, idx: i, segment });

    // ── Ticket purchase events ───────────────────────────────────────────────
    const ticketCount   = numTickets(segment);
    const fixtureIdxs   = getFixtureIndices(segment, ticketCount, i);
    for (const fIdx of fixtureIdxs) {
      const fix = FIXTURES[fIdx];
      allEvents.push({
        clubId,
        supporterId:       supporter.id,
        source:            'ticketing',
        eventType:         'ticket_purchased',
        eventDate:         fix.date,
        value:             randFloat(18, 28),
        externalId:        `TKT-${i}-${fIdx}`,
        source_externalId: `ticketing:TKT-${i}-${fIdx}`,
        metadata: {
          fixtureId:   fix.id,
          fixtureName: fix.name,
          stand:       STANDS[i % 4],
        },
      });
    }

    // ── Merchandise events ───────────────────────────────────────────────────
    if (Math.random() < merchChance(segment)) {
      const numMerch = randInt(1, 3);
      for (let m = 0; m < numMerch; m++) {
        allEvents.push({
          clubId,
          supporterId:       supporter.id,
          source:            'ecommerce',
          eventType:         'merch_purchased',
          eventDate:         subDays(now, randInt(5, 250)),
          value:             randFloat(15, 85),
          externalId:        `MERCH-${i}-${m}`,
          source_externalId: `ecommerce:MERCH-${i}-${m}`,
          metadata: {
            orderId: `ORD-${1000 + i * 3 + m}`,
            items:   [MERCH_ITEMS[randInt(0, MERCH_ITEMS.length - 1)]],
          },
        });
      }
    }
  }

  // ── Batch-create events ──────────────────────────────────────────────────────
  // createMany in chunks of 500 to stay within Postgres param limits
  for (let c = 0; c < allEvents.length; c += 500) {
    await prisma.supporterEvent.createMany({
      data:           allEvents.slice(c, c + 500),
      skipDuplicates: true,
    });
  }
  console.log(`Created ${allEvents.length} events.`);

  // ── 5. Memberships ────────────────────────────────────────────────────────────

  for (const { id, idx } of supporterMeta) {
    // Season tickets → champions + loyal + potential_loyalist (indices 0–79)
    if (idx < 80) {
      allMemberships.push({
        clubId, supporterId: id,
        type: 'season_ticket', status: 'active',
        startDate: new Date('2024-07-01'), endDate: new Date('2025-06-30'),
        pricePaid: 299, externalId: `ST-${idx}`,
      });
    }

    // Patron → first 5 champions (indices 0–4)
    if (idx < 5) {
      allMemberships.push({
        clubId, supporterId: id,
        type: 'patron', status: 'active', tier: ['Gold','Platinum','Gold','Silver','Platinum'][idx],
        startDate: new Date('2024-07-01'), endDate: new Date('2025-06-30'),
        pricePaid: randInt(1000, 2500), externalId: `PAT-${idx}`,
      });
    }

    // FSS members → potential_loyalist[55–79] + new_fan[80–99] + first 5 at_risk[100–104]
    if (idx >= 55 && idx <= 104) {
      allMemberships.push({
        clubId, supporterId: id,
        type: 'fss_member', status: 'active',
        startDate: subDays(now, randInt(30, 730)), endDate: subDays(now, -365),
        pricePaid: 25, externalId: `FSS-${idx}`,
      });
    }

    // Junior bairns → casual[155–174]
    if (idx >= 155 && idx <= 174) {
      allMemberships.push({
        clubId, supporterId: id,
        type: 'junior_bairn', status: 'active',
        startDate: new Date('2024-08-01'), endDate: new Date('2025-07-31'),
        pricePaid: 50, externalId: `JB-${idx}`,
      });
    }

    // Expired memberships → first 10 lapsed supporters (indices 125–134)
    if (idx >= 125 && idx <= 134) {
      allMemberships.push({
        clubId, supporterId: id,
        type: 'club_membership', status: 'expired',
        startDate: subDays(now, 400), endDate: subDays(now, 40),
        pricePaid: 45, externalId: `EXP-${idx}`,
      });
    }
  }

  await prisma.membership.createMany({ data: allMemberships, skipDuplicates: true });
  console.log(`Created ${allMemberships.length} membership records.`);

  // ── 6. Campaigns ─────────────────────────────────────────────────────────────
  await prisma.campaign.createMany({
    data: [
      {
        clubId, name: 'Win-Back Lapsed Fans', channel: 'email', type: 'triggered',
        status: 'active', triggerConfig: { segment: 'lapsed' },
      },
      {
        clubId, name: 'At-Risk Re-engagement', channel: 'email', type: 'triggered',
        status: 'active',
        triggerConfig: { event: 'ticket_purchased', daysAfter: 90, noPurchaseSince: true },
      },
      {
        clubId, name: 'New Fan Welcome Series', channel: 'email', type: 'triggered',
        status: 'active', triggerConfig: { segment: 'new_fan' },
      },
    ],
  });
  console.log('Created 3 campaigns.');

  // ── 7. Ingestion logs (14 days × 4 sources) ───────────────────────────────────
  const SOURCES = ['ticketing','membership','ecommerce','social'] as const;
  const recordRanges: Record<string, [number, number]> = {
    ticketing: [150, 400], membership: [80, 120], ecommerce: [20, 60], social: [0, 0],
  };
  const logStatuses = ['success','success','success','success','success',
    'success','success','success','success','partial','partial','failed'] as const;

  const allLogs: Prisma.IngestionLogCreateManyInput[] = [];
  for (let day = 13; day >= 0; day--) {
    for (const source of SOURCES) {
      const [rMin, rMax] = recordRanges[source];
      const processed = source === 'social' ? 0 : randInt(rMin, rMax);
      const statusIdx  = (day * 4 + SOURCES.indexOf(source)) % logStatuses.length;
      const status     = logStatuses[statusIdx];
      const failed     = status === 'failed' ? randInt(1, 5) : status === 'partial' ? randInt(1, 3) : 0;
      const startedAt  = subDays(now, day);
      startedAt.setHours(2, randInt(0, 10), 0, 0);
      const completedAt = new Date(startedAt.getTime() + randInt(8000, 45000));

      allLogs.push({
        clubId, source, status,
        startedAt, completedAt,
        recordsProcessed: processed,
        recordsCreated:   Math.max(0, processed - randInt(0, Math.floor(processed * 0.3))),
        recordsUpdated:   randInt(0, Math.floor(processed * 0.3)),
        recordsFailed:    failed,
        metadata:         {},
      });
    }
  }
  await prisma.ingestionLog.createMany({ data: allLogs });
  console.log(`Created ${allLogs.length} ingestion log entries (14 days × 4 sources).`);

  // ── 8. Summary ───────────────────────────────────────────────────────────────
  const [totalSupporters, totalEvents, totalMemberships] = await Promise.all([
    prisma.supporter.count({ where: { clubId } }),
    prisma.supporterEvent.count({ where: { clubId } }),
    prisma.membership.count({ where: { clubId } }),
  ]);

  const segmentCounts = await prisma.supporter.groupBy({
    by: ['segment'], where: { clubId }, _count: { id: true },
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Supporters:  ${totalSupporters}`);
  console.log(`Events:      ${totalEvents}`);
  console.log(`Memberships: ${totalMemberships}`);
  console.log('\nSegment breakdown:');
  segmentCounts
    .sort((a, b) => b._count.id - a._count.id)
    .forEach(({ segment, _count }) => {
      console.log(`  ${String(segment).padEnd(22)} ${_count.id}`);
    });
  console.log('\nDone! Run `npm run db:studio` to explore the data.\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Add this to your .env and .env.local:');
  console.log(`CLUB_ID=${clubId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
