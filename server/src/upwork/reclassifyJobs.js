import { pathToFileURL } from 'node:url';

import { reclassifyUpworkJobs } from './store.js';

async function main() {
  const before = Date.now();
  const state = await reclassifyUpworkJobs();
  const elapsedSeconds = ((Date.now() - before) / 1000).toFixed(1);

  console.log(`Reclassified ${state.jobs.length} Upwork jobs in ${elapsedSeconds}s`);
  console.log(JSON.stringify(state.summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
