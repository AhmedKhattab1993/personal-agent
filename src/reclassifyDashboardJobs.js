import { pathToFileURL } from 'node:url';

import { reclassifyDashboardJobs } from './dashboardStore.js';

async function main() {
  const before = Date.now();
  const state = await reclassifyDashboardJobs();
  const elapsedSeconds = ((Date.now() - before) / 1000).toFixed(1);

  console.log(`Reclassified ${state.jobs.length} dashboard jobs in ${elapsedSeconds}s`);
  console.log(JSON.stringify(state.summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
