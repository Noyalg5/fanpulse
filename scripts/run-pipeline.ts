#!/usr/bin/env tsx
// Manual pipeline trigger — run from the terminal:
//   npm run pipeline:run                    (all sources)
//   npm run pipeline:ticketing              (one source)
//   npx tsx scripts/run-pipeline.ts --source membership

import { runPipeline } from '../src/lib/pipeline';
import { logger } from '../src/lib/logger';
import type { DataSource } from '../src/types';

const args = process.argv.slice(2);
const sourceFlag = args.indexOf('--source');
const source = sourceFlag !== -1 ? (args[sourceFlag + 1] as DataSource) : undefined;
const sources: DataSource[] = source
  ? [source]
  : ['ticketing', 'membership', 'ecommerce', 'social'];

(async () => {
  logger.info({ sources }, 'Manual pipeline run starting');
  const results = await runPipeline(sources, false);

  for (const r of results) {
    if (r.status === 'failed') {
      logger.error(r, `${r.source}: FAILED`);
    } else {
      logger.info(r, `${r.source}: ${r.status.toUpperCase()} — ${r.processed} records`);
    }
  }

  process.exit(results.some((r) => r.status === 'failed') ? 1 : 0);
})();
