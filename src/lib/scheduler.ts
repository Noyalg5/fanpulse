// ─────────────────────────────────────────────
// FanPulse — Cron Scheduler
//
// Runs the pipeline automatically on a schedule.
// Start with: npx tsx scripts/scheduler.ts
//
// On Vercel: use vercel.json cron jobs to hit /api/sync instead.
// ─────────────────────────────────────────────

import cron from 'node-cron';
import { runPipeline } from '@/lib/pipeline';
import { runEnrichment } from '@/lib/enrichment/scoring';
import { evaluateTriggeredCampaigns } from '@/lib/campaigns/engine';
import { sendPendingEmails } from '@/lib/campaigns/emailSender';
import { logger } from '@/lib/logger';

// ── Schedule configuration ────────────────────────────────────────────────────
// Adjust these cron expressions to match your preferred sync frequency.
// Default: pipeline runs nightly at 2am, enrichment runs at 3am.

const PIPELINE_SCHEDULE = process.env.PIPELINE_CRON ?? '0 2 * * *';   // 02:00 every night
const ENRICHMENT_SCHEDULE = process.env.ENRICHMENT_CRON ?? '0 3 * * *'; // 03:00 every night

export function startScheduler() {
  logger.info({ pipeline: PIPELINE_SCHEDULE, enrichment: ENRICHMENT_SCHEDULE }, 'Scheduler starting');

  // ── Nightly data sync ─────────────────────────────────────────────────────
  cron.schedule(PIPELINE_SCHEDULE, async () => {
    logger.info('Scheduled pipeline run starting');
    try {
      await runPipeline(['ticketing', 'membership', 'ecommerce', 'social'], false);
      logger.info('Scheduled pipeline run complete');
    } catch (err) {
      logger.error({ err }, 'Scheduled pipeline run failed');
    }
  });

  // ── Nightly enrichment ────────────────────────────────────────────────────
  cron.schedule(ENRICHMENT_SCHEDULE, async () => {
    logger.info('Scheduled enrichment run starting');
    try {
      await runEnrichment();
      logger.info('Scheduled enrichment run complete');
    } catch (err) {
      logger.error({ err }, 'Scheduled enrichment run failed');
    }
  });

  // ── Campaign evaluation (after enrichment) ───────────────────────────────
  cron.schedule('30 3 * * *', async () => {
    logger.info('Scheduled campaign evaluation starting');
    try {
      const results = await evaluateTriggeredCampaigns();
      const total = results.reduce((sum, r) => sum + r.newRecipients, 0);
      logger.info({ results, totalNewRecipients: total }, 'Scheduled campaign evaluation complete');
    } catch (err) {
      logger.error({ err }, 'Scheduled campaign evaluation failed');
    }
  });

  // ── Campaign email send ───────────────────────────────────────────────────
  cron.schedule('0 4 * * *', async () => {
    logger.info('Scheduled campaign email send starting');
    try {
      const result = await sendPendingEmails();
      logger.info(result, 'Scheduled campaign email send complete');
    } catch (err) {
      logger.error({ err }, 'Scheduled campaign email send failed');
    }
  });

  logger.info('Scheduler running. Press Ctrl+C to stop.');
}
