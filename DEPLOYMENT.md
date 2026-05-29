# FanPulse — Deployment Guide

Deploy FanPulse to Vercel with a Neon PostgreSQL database and fully automated
nightly cron jobs. The Hobby (free) plan covers everything needed for a single club.

---

## 1. Prerequisites

- **Node.js 18+** and **npm** installed locally
- **A PostgreSQL database** — [Neon](https://neon.tech) is recommended (free tier, no credit card)
  - Create a project, copy the connection string from the dashboard
  - It looks like: `postgresql://user:pass@ep-xyz.us-east-1.aws.neon.tech/neondb?sslmode=require`
- **A Vercel account** — [vercel.com](https://vercel.com), Hobby plan is free

---

## 2. First-time deployment

### Step 1 — Install the Vercel CLI

```bash
npm i -g vercel
```

### Step 2 — Log in

```bash
vercel login
```

Follow the browser prompt to authenticate.

### Step 3 — Deploy

Run this from the project root:

```bash
vercel --prod
```

Vercel will detect Next.js automatically. When asked:
- **Link to existing project?** → No (first deploy)
- **Project name** → `fanpulse` (or your preferred name)
- **Root directory** → `.` (press Enter)

Your app will be live at `https://fanpulse-xxx.vercel.app` (Vercel assigns a URL).

### Step 4 — Set environment variables

Go to **Vercel dashboard → your project → Settings → Environment Variables** and add each variable below. Set the environment to **Production** (and optionally Preview/Development).

| Variable | Where to get it | Required? |
|---|---|---|
| `DATABASE_URL` | Neon dashboard → Connection string | ✅ Required |
| `PIPELINE_SECRET` | Generate: `openssl rand -hex 32` | ✅ Required |
| `CRON_SECRET` | Generate: `openssl rand -hex 32` — use the **same value** Vercel uses (see note below) | ✅ Required for cron |
| `NEXTAUTH_URL` | Your Vercel deployment URL, e.g. `https://fanpulse.vercel.app` | Recommended |
| `LOG_LEVEL` | `info` | Optional |
| `TICKETING_MODE` | `csv` or `api` | Optional (defaults to `csv`) |
| `TICKETING_CSV_PATH` | Path to CSV export file | Only if `TICKETING_MODE=csv` |
| `TICKETING_API_URL` | URL of your ticketing system API | Only if `TICKETING_MODE=api` |
| `TICKETING_API_KEY` | API key for your ticketing system | Only if `TICKETING_MODE=api` |
| `MEMBERSHIP_MODE` | `csv` or `api` | Optional (defaults to `csv`) |
| `MEMBERSHIP_CSV_PATH` | Path to CSV export file | Only if `MEMBERSHIP_MODE=csv` |
| `MEMBERSHIP_API_URL` | URL of your membership system API | Only if `MEMBERSHIP_MODE=api` |
| `MEMBERSHIP_API_KEY` | API key for your membership system | Only if `MEMBERSHIP_MODE=api` |
| `ECOMMERCE_MODE` | `csv`, `shopify`, or `woocommerce` | Optional (defaults to `csv`) |
| `ECOMMERCE_CSV_PATH` | Path to CSV export file | Only if `ECOMMERCE_MODE=csv` |
| `ECOMMERCE_API_URL` | Shopify/WooCommerce API URL | Only if using API mode |
| `ECOMMERCE_API_KEY` | Shopify/WooCommerce API key | Only if using API mode |
| `SENDGRID_API_KEY` | [sendgrid.com](https://sendgrid.com) → API Keys | Required for email campaigns |
| `EMAIL_FROM` | Verified sender address, e.g. `noreply@falkirkfc.co.uk` | Required for email campaigns |
| `EMAIL_FROM_NAME` | Display name, e.g. `Falkirk FC` | Optional |
| `SOCIAL_META_PAGE_ID` | Meta Business Suite | Only if using social adapter |
| `SOCIAL_META_ACCESS_TOKEN` | Meta Business Suite | Only if using social adapter |
| `SOCIAL_X_BEARER_TOKEN` | X (Twitter) Developer Portal | Only if using social adapter |

> **CRON_SECRET note:** On Vercel Pro, Vercel automatically generates and injects
> `CRON_SECRET` into every cron job request. On Hobby, you must set it manually:
> generate a strong secret with `openssl rand -hex 32`, add it as `CRON_SECRET` in
> the Vercel dashboard, and FanPulse will accept it automatically.

### Step 5 — Redeploy with env vars active

```bash
vercel --prod
```

Environment variables are only picked up on a fresh deploy.

---

## 3. Database setup in production

Run these commands locally, pointing at your production database:

```bash
# Push the Prisma schema (creates all tables)
DATABASE_URL="your-neon-connection-string" npx prisma db push

# Optional: load mock supporter data to verify the UI
DATABASE_URL="your-neon-connection-string" npx tsx scripts/seed.ts
```

---

## 4. Verifying cron jobs work

### Check the cron schedule

Go to **Vercel dashboard → your project → Cron Jobs**. You should see four jobs listed:

| Path | Schedule (UTC) |
|---|---|
| `/api/sync` | Every day at 02:00 |
| `/api/enrich` | Every day at 03:00 |
| `/api/campaigns/evaluate` | Every day at 03:30 |
| `/api/campaigns/send` | Every day at 04:00 |

> **Important:** Vercel cron jobs send HTTP **GET** requests (not POST). FanPulse's
> route handlers export both GET and POST — POST is for manual curl triggers,
> GET is for Vercel cron. Both require a valid bearer token.

### Manually trigger the pipeline to test

```bash
# 1. Sync all data sources
curl -X POST https://YOUR-APP.vercel.app/api/sync \
  -H "Authorization: Bearer YOUR_PIPELINE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sources": ["ticketing", "membership", "ecommerce", "social"]}'

# 2. Run enrichment (RFM scoring + segmentation)
curl -X POST https://YOUR-APP.vercel.app/api/enrich \
  -H "Authorization: Bearer YOUR_PIPELINE_SECRET"

# 3. Evaluate triggered campaigns
curl -X POST https://YOUR-APP.vercel.app/api/campaigns/evaluate \
  -H "Authorization: Bearer YOUR_PIPELINE_SECRET"

# 4. Send pending campaign emails
curl -X POST https://YOUR-APP.vercel.app/api/campaigns/send \
  -H "Authorization: Bearer YOUR_PIPELINE_SECRET"

# 5. Check pipeline status
curl https://YOUR-APP.vercel.app/api/status
```

### Check function logs

**Vercel dashboard → your project → Functions → Logs**

Filter by function path (e.g. `/api/sync`) to see execution details, durations,
and any errors from each run.

### Check the dashboard

Visit `https://YOUR-APP.vercel.app/dashboard` to see:
- Total supporter count and lifetime value
- Segment breakdown (run enrichment first)
- Pipeline status per source
- Campaign recipient counts

---

## 5. Adding a second club (replication)

FanPulse is designed to scale across multiple clubs. The adapter pattern means
each data source is self-contained, and all configuration lives in environment variables.

To onboard a second club (e.g. Alloa Athletic FC):

1. **Fork or clone** the FanPulse repository
2. **Create a new Vercel project** pointing at the forked repo
3. **Provision a separate Neon database** for the new club — supporter data must
   stay isolated between clubs (GDPR / data separation)
4. **Set all environment variables** in the new Vercel project with the second club's
   credentials (`DATABASE_URL`, `PIPELINE_SECRET`, `SENDGRID_*`, etc.)
5. **Set `CLUB_ID`** as an environment variable (e.g. `CLUB_ID=alloa`) — this
   variable is available for future multi-tenancy features such as branded email
   templates and club-specific pipeline configuration
6. **Deploy** with `vercel --prod`

Each club gets its own:
- Vercel project (separate deployment, separate URL)
- PostgreSQL database (no shared data)
- Pipeline credentials and cron schedule
- Dashboard at `/dashboard`

This approach avoids any cross-club data leakage and lets each club be configured
independently — critical for GDPR compliance in a KTP academic context.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/sync` returns 401 | Wrong `PIPELINE_SECRET` | Re-check env var in Vercel dashboard, redeploy |
| Cron jobs not appearing | `vercel.json` not deployed | Run `vercel --prod` again |
| Cron jobs fire but return 401 | `CRON_SECRET` mismatch | Ensure `CRON_SECRET` in Vercel env vars matches what Vercel injects |
| `PrismaClientInitializationError` | `DATABASE_URL` wrong or not set | Verify connection string in Vercel env vars, redeploy |
| Enrichment returns 0 updated | No events in database | Run `/api/sync` first, then `/api/enrich` |
| Emails not sending | `SENDGRID_API_KEY` missing | Add to Vercel env vars, verify sender address in SendGrid |
