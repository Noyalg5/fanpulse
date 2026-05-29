# FanPulse — Project Context

## What this project is

FanPulse is a **Supporter Intelligence & Automated Engagement Platform** built for Falkirk FC as part of a Knowledge Transfer Partnership (KTP) with Heriot-Watt University. The goal: turn raw supporter data from multiple source systems into a unified profile database that automatically segments fans, scores their engagement, and triggers personalised marketing — with minimal ongoing maintenance.

The platform is designed to scale: it can be replicated at other football clubs by swapping out adapter configurations.

---

## Tech stack

- **Next.js 14** (App Router) — full-stack framework; API routes + future dashboard
- **TypeScript** — strict mode throughout
- **Prisma + PostgreSQL** — database ORM; schema in `prisma/schema.prisma`
- **node-cron** — background scheduler for nightly sync
- **Zod** — runtime validation of all incoming records
- **Pino** — structured logging

---

## Project structure

```
fanpulse/
├── prisma/
│   └── schema.prisma          # Database schema — edit this to add fields
├── src/
│   ├── types/index.ts         # All shared TypeScript types
│   ├── lib/
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── logger.ts          # Pino logger
│   │   ├── pipeline/
│   │   │   ├── base.ts        # BaseAdapter — all adapters extend this
│   │   │   ├── ticketing.ts   # Ticketing data ingestion
│   │   │   ├── membership.ts  # Membership data ingestion
│   │   │   ├── ecommerce.ts   # E-commerce / merch ingestion
│   │   │   ├── social.ts      # Social media (stub — needs API credentials)
│   │   │   └── index.ts       # Pipeline orchestrator
│   │   ├── enrichment/
│   │   │   └── scoring.ts     # RFM scoring + supporter segmentation
│   │   └── scheduler.ts       # Cron job configuration
│   └── app/
│       └── api/
│           ├── sync/route.ts   # POST /api/sync — trigger pipeline
│           ├── enrich/route.ts # POST /api/enrich — trigger scoring
│           └── status/route.ts # GET /api/status — pipeline health
├── scripts/
│   ├── run-pipeline.ts        # CLI: npm run pipeline:run
│   ├── scheduler.ts           # CLI: start background scheduler
│   └── seed.ts                # CLI: npm run db:seed (mock data)
├── .env.example               # Copy to .env.local and fill in values
└── PROJECT.md                 # This file
```

---

## Key design decisions

**Adapter pattern** — each data source is a self-contained class (`TicketingAdapter`, `MembershipAdapter`, etc.) that implements `extract() → transform() → load()`. To add a new source, extend `BaseAdapter` and register it in `pipeline/index.ts`.

**Idempotent upserts** — re-running a sync never creates duplicate records. Events are deduplicated by `source_externalId` (format: `"ticketing:TKT-001"`). Supporters are deduplicated by email.

**Consent-safe** — the `Supporter` model tracks `emailConsent` and `smsConsent` separately. The load logic never downgrades consent (can add but not remove).

**RFM scoring** — engagement is computed using Recency (days since last interaction), Frequency (matches attended), and Monetary (total spend). Weighted 40/35/25. Segment labels: `champion`, `loyal`, `potential_loyalist`, `new_fan`, `at_risk`, `lapsed`, `casual`, `hibernating`.

---

## Common tasks

### First-time setup
```bash
npm install
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL and other values
npm run db:push        # Push schema to database
npm run db:seed        # Load mock supporter data
npm run dev            # Start Next.js dev server
```

### Run the pipeline manually
```bash
npm run pipeline:run                          # All sources
npm run pipeline:ticketing                    # One source only
npx tsx scripts/run-pipeline.ts --source membership
```

### Trigger via API
```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Authorization: Bearer your-pipeline-secret" \
  -H "Content-Type: application/json" \
  -d '{"sources": ["ticketing", "membership"]}'
```

### Check pipeline status
```bash
curl http://localhost:3000/api/status
```

### Run enrichment (scoring + segmentation)
```bash
curl -X POST http://localhost:3000/api/enrich \
  -H "Authorization: Bearer your-pipeline-secret"
```

### Start background scheduler
```bash
npx tsx scripts/scheduler.ts
```

### Explore the database
```bash
npm run db:studio    # Opens Prisma Studio in your browser
```

---

## Adding a new data source

1. Create `src/lib/pipeline/your-source.ts`
2. Extend `BaseAdapter`, set `readonly source = 'your-source' as const`
3. Implement `extract()` — pull raw records from the source
4. Implement `transform()` — map to `NormalisedSupporter[]` + `NormalisedEvent[]`
5. Add your source to the `ADAPTERS` registry in `src/lib/pipeline/index.ts`
6. Add the source to the `DataSource` type in `src/types/index.ts`
7. Add environment variables to `.env.example`

**Multi-tenancy rule:** Every Prisma `findMany`, `findUnique`, `count`, `create`, `upsert`, and `update` that touches `Supporter`, `Membership`, `SupporterEvent`, `Campaign`, `IngestionLog`, or `DataSourceConfig` must include `clubId` in the `where` clause (for reads) or `data` object (for writes). Get the current club's ID via `getClubId()` from `@/lib/db`. The `BaseAdapter.load()` and `BaseAdapter.run()` methods in `base.ts` already handle this — new adapter code only needs to call `extract()` and `transform()`.

---

## What still needs building

The following features are scaffolded but not yet implemented — good next tasks:

- **Dashboard** (`src/app/dashboard/`) — a Next.js page showing supporter segments, key metrics, and pipeline status. Use the `/api/status` endpoint as a data source.
- **Campaign automation** — the `Campaign` and `CampaignRecipient` Prisma models exist; need an engine that matches supporters to campaign triggers and queues outbound emails via SendGrid.
- **Website analytics adapter** (`src/lib/pipeline/website.ts`) — pull from Google Analytics 4 API or Plausible.
- **Email adapter** (`src/lib/pipeline/email.ts`) — pull send/open/click data from Mailchimp or similar.
- **Social adapter** (`src/lib/pipeline/social.ts`) — currently a stub; implement once Meta/X API credentials are available.
- **Auth** — the API routes are protected by `PIPELINE_SECRET` only; add NextAuth for a staff-facing dashboard.
- **Vercel deployment config** — add `vercel.json` with cron job definitions to replace the Node.js scheduler.

---

## Environment variables quick reference

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `CLUB_ID` | Prisma cuid of the Club record — printed by `npm run db:seed`. All queries are scoped to this club. |
| `PIPELINE_SECRET` | Protects /api/sync and /api/enrich |
| `CRON_SECRET` | Vercel-injected token for cron job authentication |
| `TICKETING_MODE` | `api` or `csv` |
| `TICKETING_CSV_PATH` | Path to ticketing export CSV |
| `MEMBERSHIP_MODE` | `api` or `csv` |
| `ECOMMERCE_MODE` | `shopify`, `woocommerce`, or `csv` |
| `SENDGRID_API_KEY` | SendGrid API key for campaign emails |
| `EMAIL_FROM` | Verified sender address |

See `.env.example` for the full list.
