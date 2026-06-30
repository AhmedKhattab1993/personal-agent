import { graphql } from './client.js';

export const SOFTWARE_DEV_CATEGORY_ID = '531770282580668418';
export const SOFTWARE_DEV_CATEGORY_NAME = 'Web, Mobile & Software Dev';
export const PAGE_SIZE = 50;

export const JOB_QUERY = /* GraphQL */ `
  query LatestSoftwareJobs(
    $filter: MarketplaceJobPostingsSearchFilter,
    $sort: [MarketplaceJobPostingSearchSortAttribute]
  ) {
    marketplaceJobPostingsSearch(
      marketPlaceJobFilter: $filter,
      searchType: USER_JOBS_SEARCH,
      sortAttributes: $sort
    ) {
      totalCount
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          id
          ciphertext
          title
          description
          publishedDateTime
          createdDateTime
          renewedDateTime
          category
          subcategory
          duration
          durationLabel
          engagement
          experienceLevel
          totalApplicants
          skills {
            name
            prettyName
            highlighted
          }
          client {
            totalHires
            totalPostedJobs
            totalSpent {
              rawValue
              currency
              displayValue
            }
            verificationStatus
            location {
              country
              city
              state
              timezone
            }
            totalReviews
            totalFeedback
          }
          amount {
            rawValue
            currency
            displayValue
          }
          hourlyBudgetMin {
            rawValue
            currency
            displayValue
          }
          hourlyBudgetMax {
            rawValue
            currency
            displayValue
          }
          occupations {
            category {
              id
              prefLabel
            }
            subCategories {
              id
              prefLabel
            }
            occupationService {
              id
              prefLabel
            }
          }
        }
      }
    }
  }
`;

export function parseLimit(value, fallback = 1000) {
  const limit = Number(value ?? fallback);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`limit must be a positive integer, got ${value}`);
  }
  return limit;
}

export function summarizeJobs(jobs, totalCount, outputPath = null) {
  const ids = new Set(jobs.map((job) => job.id));
  const outOfPublishedOrder = jobs.findIndex((job, index) => (
    index > 0
    && new Date(job.publishedDateTime) > new Date(jobs[index - 1].publishedDateTime)
  ));

  return {
    generatedAt: new Date().toISOString(),
    source: 'upwork.graphql.marketplaceJobPostingsSearch',
    categoryId: SOFTWARE_DEV_CATEGORY_ID,
    categoryName: SOFTWARE_DEV_CATEGORY_NAME,
    sort: 'RECENCY',
    requested: jobs.length,
    fetched: jobs.length,
    unique: ids.size,
    duplicates: jobs.length - ids.size,
    totalCount,
    newestPublishedDateTime: jobs[0]?.publishedDateTime ?? null,
    oldestPublishedDateTime: jobs.at(-1)?.publishedDateTime ?? null,
    outOfPublishedOrderIndex: outOfPublishedOrder,
    outputPath,
  };
}

export async function fetchLatestSoftwareJobs(limit = 1000, onPage = null) {
  const jobs = [];
  let after = '0';
  let totalCount = null;

  while (jobs.length < limit) {
    const remaining = limit - jobs.length;
    const first = Math.min(PAGE_SIZE, remaining);
    const filter = {
      categoryIds_any: [SOFTWARE_DEV_CATEGORY_ID],
      pagination_eq: { after, first },
    };
    const variables = {
      filter,
      sort: [{ field: 'RECENCY' }],
    };
    const data = await graphql(JOB_QUERY, variables);
    const result = data?.marketplaceJobPostingsSearch;
    if (!result) {
      throw new Error('missing marketplaceJobPostingsSearch result');
    }

    totalCount ??= result.totalCount;
    const batch = result.edges?.map((edge) => edge.node) ?? [];
    jobs.push(...batch);
    onPage?.({
      batchSize: batch.length,
      totalFetched: jobs.length,
      endCursor: result.pageInfo?.endCursor ?? null,
    });

    if (!result.pageInfo?.hasNextPage || batch.length === 0) {
      break;
    }
    after = result.pageInfo.endCursor;
  }

  const trimmed = jobs.slice(0, limit);
  return {
    jobs: trimmed,
    summary: summarizeJobs(trimmed, totalCount),
  };
}
