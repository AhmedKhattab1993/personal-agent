import { graphql } from './client.js';

const SOFTWARE_DEV_CATEGORY_ID = '531770282580668418';
export const SOFTWARE_DEV_CATEGORY_NAME = 'Web, Mobile & Software Dev';
const PAGE_SIZE = 50;
export const POSITIONING_SEARCH_SOURCE = 'upwork.graphql.marketplaceJobPostingsSearch+positioningKeywordSearches.v2';
const POSITIONING_SEARCH_EXPRESSIONS = [
  'trading',
  'backtesting trading',
  'back-testing trading',
  'Alpaca backtester',
  'Pine Script TradingView',
  'broker API trading',
  'market data trading',
  'AI agent workflow',
  'Claude automation',
  'OpenAI chatbot',
  'RAG agent',
  'LangChain agent',
  'CRM agent',
  'workflow automation',
  'Zapier automation',
  'Make.com automation',
  'n8n automation',
  'API integration automation',
  'data pipeline automation',
];
const MAX_POSITIONING_SEARCH_PAGES = 100;

const JOB_QUERY = /* GraphQL */ `
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

function sortJobsByPublishedDate(jobs) {
  return [...jobs].sort((a, b) => {
    const dateDiff = new Date(b.publishedDateTime ?? 0) - new Date(a.publishedDateTime ?? 0);
    if (dateDiff !== 0) return dateDiff;
    return String(a.id).localeCompare(String(b.id));
  });
}

function dedupeJobs(jobs) {
  const byId = new Map();
  for (const job of jobs) {
    if (!byId.has(job.id)) byId.set(job.id, job);
  }
  return [...byId.values()];
}

function isAfterDate(job, sinceDate) {
  return new Date(job.publishedDateTime ?? 0) > sinceDate;
}

async function fetchRecentSearchExpressionJobs(searchExpression, sinceDate) {
  const jobs = [];
  let after = '0';
  let totalCount = null;
  let pages = 0;

  while (true) {
    pages += 1;
    if (pages > MAX_POSITIONING_SEARCH_PAGES) {
      throw new Error(`search pagination exceeded ${MAX_POSITIONING_SEARCH_PAGES} pages for ${searchExpression}`);
    }

    const variables = {
      filter: {
        searchExpression_eq: searchExpression,
        pagination_eq: { after, first: PAGE_SIZE },
      },
      sort: [{ field: 'RECENCY' }],
    };
    const data = await graphql(JOB_QUERY, variables);
    const result = data?.marketplaceJobPostingsSearch;
    if (!result) {
      throw new Error(`missing marketplaceJobPostingsSearch result for ${searchExpression}`);
    }

    totalCount ??= result.totalCount;
    const batch = result.edges?.map((edge) => edge.node) ?? [];
    jobs.push(...batch.filter((job) => isAfterDate(job, sinceDate)));

    const reachedSinceDate = batch.some((job) => !isAfterDate(job, sinceDate));
    if (
      reachedSinceDate
      || !result.pageInfo?.hasNextPage
      || !result.pageInfo.endCursor
      || batch.length === 0
    ) {
      break;
    }
    after = result.pageInfo.endCursor;
  }

  return {
    searchExpression,
    totalCount,
    jobs,
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

export async function fetchRecentPositioningJobs({ sinceDate, onPage = null } = {}) {
  const since = sinceDate instanceof Date ? sinceDate : new Date(sinceDate);
  if (Number.isNaN(since.getTime())) {
    throw new Error(`sinceDate must be a valid date, got ${sinceDate}`);
  }

  const searchResults = [];
  for (const searchExpression of POSITIONING_SEARCH_EXPRESSIONS) {
    const result = await fetchRecentSearchExpressionJobs(searchExpression, since);
    searchResults.push(result);
    onPage?.({
      searchExpression,
      batchSize: result.jobs.length,
      totalFetched: searchResults.reduce((sum, item) => sum + item.jobs.length, 0),
      endCursor: null,
    });
  }

  const jobs = sortJobsByPublishedDate(dedupeJobs(searchResults.flatMap((result) => result.jobs)));
  return {
    jobs,
    summary: {
      ...summarizeJobs(jobs, null),
      source: POSITIONING_SEARCH_SOURCE,
      sinceDateTime: since.toISOString(),
      searchMode: 'keyword_time_window',
      supplementalSearches: searchResults.map((result) => ({
        searchExpression: result.searchExpression,
        fetched: result.jobs.length,
        totalCount: result.totalCount,
      })),
    },
  };
}
