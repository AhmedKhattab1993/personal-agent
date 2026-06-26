import { graphql } from './client.js';

/**
 * Fetch public job postings from Upwork via the GraphQL API.
 *
 * Schema verified by introspection (field/arg names are exact, not guessed):
 *   query.publicMarketplaceJobPostingsSearch(marketPlaceJobFilter: ...!)
 *     filter.searchExpression_eq: String   ← the search query
 *     filter.pagination: { pageOffset: Int!, pageSize: Int! }
 *
 * Usage:  node src/fetchJobs.js [searchQuery] [pageSize]
 *   e.g.  node src/fetchJobs.js "react node" 5
 */
const JOB_QUERY = /* GraphQL */ `
  query JobSearch($filter: PublicMarketplaceJobPostingsSearchFilter!) {
    publicMarketplaceJobPostingsSearch(marketPlaceJobFilter: $filter) {
      jobs {
        id
        title
        description
        type
        category
        subcategory
        hourlyBudgetMin
        hourlyBudgetMax
        publishedDateTime
        duration
        totalApplicants
        ciphertext
        enterpriseJob
        jobStatus
      }
    }
  }
`;

async function main() {
  const searchExpression = process.argv[2] ?? '';
  const pageSize = Number(process.argv[3] ?? 10);
  const pageOffset = 0;

  console.log(`▶ Searching Upwork jobs: "${searchExpression}" (page size ${pageSize})\n`);

  const filter = {
    searchExpression_eq: searchExpression,
    pagination: { pageOffset, pageSize },
  };

  try {
    const data = await graphql(JOB_QUERY, { filter });
    const result = data?.publicMarketplaceJobPostingsSearch ?? {};
    const jobs = result.jobs ?? [];

    console.log(`✓ Showing ${jobs.length} jobs:\n`);
    for (const job of jobs) {
      const budget = job.hourlyBudgetMin != null
        ? `$${job.hourlyBudgetMin}–${job.hourlyBudgetMax}/hr`
        : '—';
      console.log(`• ${job.title}`);
      console.log(`    ${budget} · ${job.category ?? '—'} · ${job.totalApplicants ?? 0} applicants`);
      console.log(`    posted ${job.publishedDateTime ?? '—'} · ${job.type ?? ''}`);
      console.log('');
    }
    console.log('(raw JSON below)');
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('✗', e.message);
    process.exit(1);
  }
}

main();
