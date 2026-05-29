// ─────────────────────────────────────────────
// FanPulse — Pipeline Orchestrator
//
// Runs adapters in parallel or sequentially.
// Import and call runPipeline() from API routes or scripts.
// ─────────────────────────────────────────────

import { TicketingAdapter } from './ticketing';
import { MembershipAdapter } from './membership';
import { EcommerceAdapter } from './ecommerce';
import { SocialAdapter } from './social';
import { logger } from '@/lib/logger';
import type { DataSource, PipelineRunResult } from '@/types';

// Registry of all available adapters
const ADAPTERS: Record<DataSource, () => { run(): Promise<PipelineRunResult> }> = {
  ticketing: () => new TicketingAdapter(),
  membership: () => new MembershipAdapter(),
  ecommerce: () => new EcommerceAdapter(),
  social: () => new SocialAdapter(),
  // Placeholders for future adapters:
  website: () => { throw new Error('Website adapter not yet implemented'); },
  email: () => { throw new Error('Email adapter not yet implemented'); },
};

/**
 * Run one or more pipeline adapters.
 *
 * @param sources - Which sources to run. Defaults to all enabled sources.
 * @param parallel - Run sources in parallel (faster) or sequentially (safer for rate limits).
 */
export async function runPipeline(
  sources: DataSource[] = ['ticketing', 'membership', 'ecommerce', 'social'],
  parallel = false,
): Promise<PipelineRunResult[]> {
  logger.info({ sources, parallel }, 'Starting FanPulse pipeline');
  const start = Date.now();

  let results: PipelineRunResult[];

  if (parallel) {
    // Run all adapters at the same time — faster but uses more API quota simultaneously
    results = await Promise.all(
      sources.map(async (source) => {
        try {
          const adapter = ADAPTERS[source]();
          return await adapter.run();
        } catch (err) {
          logger.error({ source, err }, 'Adapter instantiation failed');
          return {
            source,
            status: 'failed' as const,
            logId: 'unknown',
            processed: 0,
            created: 0,
            updated: 0,
            failed: 0,
            durationMs: 0,
            error: String(err),
          };
        }
      }),
    );
  } else {
    // Run adapters one by one — safer for APIs with strict rate limits
    results = [];
    for (const source of sources) {
      try {
        const adapter = ADAPTERS[source]();
        const result = await adapter.run();
        results.push(result);
      } catch (err) {
        logger.error({ source, err }, 'Adapter failed');
        results.push({
          source,
          status: 'failed' as const,
          logId: 'unknown',
          processed: 0,
          created: 0,
          updated: 0,
          failed: 0,
          durationMs: 0,
          error: String(err),
        });
      }
    }
  }

  const totalMs = Date.now() - start;
  const summary = {
    total: results.length,
    succeeded: results.filter((r) => r.status === 'success').length,
    partial: results.filter((r) => r.status === 'partial').length,
    failed: results.filter((r) => r.status === 'failed').length,
    totalRecordsProcessed: results.reduce((sum, r) => sum + r.processed, 0),
    totalMs,
  };

  logger.info(summary, 'Pipeline run complete');
  return results;
}

export { TicketingAdapter, MembershipAdapter, EcommerceAdapter, SocialAdapter };
