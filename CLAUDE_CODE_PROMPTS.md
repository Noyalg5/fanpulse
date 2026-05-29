# FanPulse — Claude Code Prompts

These are the prompts to paste into the Claude Code terminal (`claude` CLI) to build out
the remaining features. Work through them in order — each one builds on the last.

---

## Step 0 — First-time setup (run these commands yourself, not Claude)

```bash
cd fanpulse
npm install
cp .env.example .env.local
# Edit .env.local: add DATABASE_URL (get a free Postgres from https://neon.tech)
npm run db:push
npm run db:seed
npm run dev
```

---

## Step 1 — Verify the pipeline works with mock data

Paste this into Claude Code:

```
I have a Next.js project called FanPulse at the current directory. Read CLAUDE.md first
to understand the project, then:

1. Read src/lib/pipeline/base.ts, src/lib/pipeline/ticketing.ts, and prisma/schema.prisma
2. Check that the TypeScript compiles cleanly by running: npx tsc --noEmit
3. Fix any type errors you find
4. Run npm run db:seed and verify it completes without errors
5. Tell me what you found and any issues you fixed
```

---

## Step 2 — Build the supporter dashboard page

```
Read CLAUDE.md. I want to build a Next.js dashboard page at src/app/dashboard/page.tsx
that shows staff a live overview of supporter data. It should:

- Fetch data from GET /api/status (already built — read src/app/api/status/route.ts to understand the shape)
- Also query the database directly (using prisma from src/lib/db.ts) for:
  - Total supporters by segment (champion, loyal, at_risk, lapsed, new_fan, etc.)
  - Top 5 supporters by engagement score
  - Pipeline last run status for each source (ticketing, membership, ecommerce, social)
  - Total lifetime value across all supporters
- Display this as a clean, simple dashboard using Tailwind CSS
- No authentication required yet — this is an internal tool
- Use React Server Components (no "use client" unless needed for interactivity)

Use the Prisma models in prisma/schema.prisma to understand the data shapes.
Create the page and any necessary supporting files.
```

---

## Step 3 — Add a supporters list page with filtering

```
Read CLAUDE.md. Build a supporters list page at src/app/dashboard/supporters/page.tsx.

Requirements:
- Server-side rendered with Prisma
- Show a paginated table of supporters (20 per page) with columns:
  Name | Email | Segment | Engagement Score | Lifetime Value | Last Active
- Filter by segment (dropdown) — use URL search params so filters are shareable
- Search by name or email (URL search param)
- Click a row to go to /dashboard/supporters/[id] (build that detail page too)

The detail page should show:
- Supporter profile fields
- All their events (paginated, most recent first)
- Their memberships
- Engagement score breakdown (recency, frequency, monetary)

Use Tailwind CSS. Read prisma/schema.prisma for the data models.
```

---

## Step 4 — Build the campaign automation engine

```
Read CLAUDE.md. I want to build a campaign automation engine. The Campaign and
CampaignRecipient models already exist in prisma/schema.prisma.

Build the following:

1. src/lib/campaigns/engine.ts
   A function evaluateTriggeredCampaigns() that:
   - Reads all active campaigns with type "triggered" from the database
   - For each campaign, evaluates its triggerConfig against current supporter state
   - Supported trigger types to implement:
     * { "event": "membership_lapsed", "daysAfter": 7 } — supporter's most recent membership has been expired for N days
     * { "segment": "at_risk" } — supporter's segment matches
     * { "event": "ticket_purchased", "daysAfter": 30, "noPurchaseSince": true } — no ticket purchased in last N days
   - For matching supporters who have emailConsent=true and haven't already received this campaign:
     * Creates a CampaignRecipient record with status "pending"
   - Returns: { campaignId, newRecipients: number }[]

2. src/lib/campaigns/emailSender.ts
   A function sendPendingEmails() that:
   - Reads CampaignRecipient records with status "pending"
   - Sends email via SendGrid (use @sendgrid/mail, add to package.json)
   - Updates status to "sent" and sets sentAt
   - Use environment variable SENDGRID_API_KEY and EMAIL_FROM
   - Each email should include the supporter's first name as personalisation

3. src/app/api/campaigns/evaluate/route.ts
   POST endpoint (protected by PIPELINE_SECRET) that runs evaluateTriggeredCampaigns()

4. src/app/api/campaigns/send/route.ts
   POST endpoint that runs sendPendingEmails()

5. Add both endpoints to the scheduler in src/lib/scheduler.ts — run at 4am daily

Read CLAUDE.md and prisma/schema.prisma before starting.
```

---

## Step 5 — Adapt the ticketing pipeline to your real ticketing system

```
Read CLAUDE.md and src/lib/pipeline/ticketing.ts carefully.

I need to adapt the ticketing adapter to work with [DESCRIBE YOUR TICKETING SYSTEM —
e.g. "TicketCo's REST API" or "a CSV export from our Eventbrite account"].

Here is a sample of the actual data format we receive:
[PASTE A SAMPLE ROW FROM YOUR TICKETING SYSTEM HERE]

Please:
1. Update the TicketingRecordSchema in src/lib/pipeline/ticketing.ts to match the
   actual field names and types in our data
2. Update the transform() method to correctly map these fields to NormalisedSupporter
   and NormalisedEvent
3. If using CSV mode, confirm which fields contain: email, name, fixture date,
   ticket price, and whether it's a season ticket
4. Write a test: scripts/test-ticketing.ts that loads 5 rows from a sample CSV
   and logs the transformed output without writing to the database
```

---

## Step 6 — Add enrichment quality improvements

```
Read CLAUDE.md and src/lib/enrichment/scoring.ts.

The current RFM scoring is a simple heuristic. Improve it:

1. Add a "recency_days" field to the scoring output so staff can see raw recency
2. Fix the segment assignment to also consider membership status:
   - A supporter with an active season_ticket should score at minimum "loyal",
     even if they haven't attended recently
   - An FSS member (type="fss_member") should never be classified as "hibernating"
3. Add a new function generateSegmentReport() that returns a breakdown:
   { segment: string, count: number, avgEngagement: number, avgLTV: number }[]
4. Expose this at GET /api/dashboard/segments (no auth required — internal use)
5. Add a test: npx tsx scripts/test-enrichment.ts that runs on seeded data and
   logs the segment distribution
```

---

## Step 7 — Deploy to Vercel

```
Read CLAUDE.md. Help me deploy this app to Vercel.

1. Create vercel.json at the project root with:
   - Cron jobs that replace the Node.js scheduler:
     * /api/sync — runs at 02:00 UTC daily
     * /api/enrich — runs at 03:00 UTC daily
     * /api/campaigns/evaluate — runs at 03:30 UTC daily
     * /api/campaigns/send — runs at 04:00 UTC daily
   - Note: Vercel cron requires the Pro plan for schedules more frequent than daily

2. Update the cron route handlers to support Vercel's Authorization header:
   Vercel sends: Authorization: Bearer <CRON_SECRET>
   The routes currently expect: Authorization: Bearer <PIPELINE_SECRET>
   Make them accept both.

3. Create a DEPLOYMENT.md explaining:
   - How to set environment variables in Vercel dashboard
   - How to connect a Neon/Supabase PostgreSQL database
   - How to run prisma migrate in production

Check that all existing route handlers work correctly with the Vercel cron
authentication pattern before making changes.
```

---

## Step 8 — Replicate for a second club (scaling up)

```
Read CLAUDE.md. I want to make FanPulse multi-tenant so it can serve multiple
football clubs from a single deployment.

Design and implement multi-tenancy:

1. Add a Club model to prisma/schema.prisma:
   - id, name, slug (unique URL identifier), logoUrl, primaryColour
   - All Supporter, Membership, SupporterEvent, Campaign, IngestionLog records
     should belong to a club via clubId foreign key

2. Update all Prisma queries throughout the codebase to filter by clubId

3. Add CLUB_ID to .env.example — a single deployment serves one club by default,
   but the schema supports multiple clubs for future SaaS expansion

4. Update BaseAdapter to accept and propagate clubId

5. Update the seed script to create a "Falkirk FC" club record and associate
   all seeded data with it

Keep changes backwards compatible — existing single-club deployments should
continue working with CLUB_ID set to the default club's ID.
```

---

## Tips for using Claude Code effectively

- Always open the project with `claude` from the `fanpulse/` root directory — it reads CLAUDE.md automatically
- If Claude Code loses context mid-session, type: `Read CLAUDE.md and remind yourself of the project structure`
- After running `npm run db:push` following schema changes, always run `npm run db:generate` too
- Use `npm run db:studio` to visually inspect data after running a pipeline
- Check ingestion logs in Prisma Studio to debug pipeline issues
