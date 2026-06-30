import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  SOFTWARE_DEV_CATEGORY_NAME,
  fetchLatestSoftwareJobs,
  parseLimit,
  summarizeJobs,
} from './upworkJobs.js';

/**
 * Fetch Upwork's native latest Web, Mobile & Software Dev jobs.
 *
 * This intentionally avoids keyword search. The universe is Upwork's own
 * category taxonomy, and ordering is Upwork's native RECENCY sort.
 *
 * Usage:
 *   node src/fetchJobs.js [limit] [outputPath]
 *   node src/fetchJobs.js 1000 data/latest-software-dev-jobs.jsonl
 */
function defaultOutputPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(`data/upwork-latest-software-dev-jobs-${stamp}.jsonl`);
}

async function main() {
  const limit = parseLimit(process.argv[2]);
  const outputPath = resolve(process.argv[3] ?? defaultOutputPath());
  const summaryPath = outputPath.toLowerCase().endsWith('.jsonl')
    ? outputPath.replace(/\.jsonl$/i, '.summary.json')
    : `${outputPath}.summary.json`;

  try {
    console.log(`Fetching ${limit} native-recency jobs from ${SOFTWARE_DEV_CATEGORY_NAME}...`);
    const result = await fetchLatestSoftwareJobs(limit, (page) => {
      console.log(
        `  page ${Math.ceil(page.totalFetched / 50)}: ${page.batchSize} jobs, total ${page.totalFetched}, next ${page.endCursor ?? 'none'}`
      );
    });
    const summary = summarizeJobs(result.jobs, result.summary.totalCount, outputPath);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${result.jobs.map((job) => JSON.stringify(job)).join('\n')}\n`);
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

    console.log(`Wrote ${result.jobs.length} jobs to ${outputPath}`);
    console.log(`Wrote summary to ${summaryPath}`);
    console.log(JSON.stringify(summary, null, 2));
  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
