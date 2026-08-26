import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// Install the client mock before jobs.js is ever imported. Each test file
// runs in its own node --test process, so the mock never leaks elsewhere.
const calls = [];
let pages = [];
mock.module('./client.js', {
  namedExports: {
    graphql: async (query, variables) => {
      calls.push({ query, variables });
      const page = pages[Math.min(calls.length - 1, pages.length - 1)];
      if (page.error) {
        const error = new Error(page.error.message);
        error.graphqlErrors = page.error.graphqlErrors;
        throw error;
      }
      return { marketplaceJobPostingsSearch: page.result };
    },
  },
});

async function fetchWithPages(pageScript, { sinceDate = new Date('2026-08-01T00:00:00Z') } = {}) {
  pages = pageScript;
  calls.length = 0;
  const { fetchRecentPositioningJobs } = await import('./jobs.js');
  const out = await fetchRecentPositioningJobs({ sinceDate });
  return { out, calls };
}

function page(edges, { hasNextPage = false, endCursor = String(edges.length) } = {}) {
  return {
    totalCount: edges.length,
    pageInfo: { endCursor, hasNextPage },
    edges: edges.map((node) => ({ node })),
  };
}

function nullPropagationError(index, field = 'amount') {
  return {
    message: `The field at path '/marketplaceJobPostingsSearch/edges[${index}]/node/${field}' was declared as a non null type, but the code involved in retrieving data has wrongly returned a null value.`,
    path: ['marketplaceJobPostingsSearch', 'edges', index, 'node', field],
  };
}

test('recovers when Upwork null-propagates one poisoned posting mid-page', async () => {
  const job = (id, minutes) => ({
    id,
    ciphertext: `~${id}`,
    title: `Job ${id}`,
    description: 'desc',
    publishedDateTime: `2026-08-01T00:${String(minutes).padStart(2, '0')}:00Z`,
    totalApplicants: 0,
  });

  const healthy = [job('a', 10), job('b', 20)];
  const poisoned = job('poisoned', 30);
  const later = [job('c', 40), job('d', 50)];

  const poisonedSequence = [
    { error: { message: 'boom', graphqlErrors: [nullPropagationError(2)] } },
    { result: page(healthy, { hasNextPage: true, endCursor: '1' }) },
    { error: { message: 'boom', graphqlErrors: [nullPropagationError(0)] } },
    { result: page([poisoned], { hasNextPage: true, endCursor: '2' }) },
    { result: page(later) },
  ];
  const emptyTail = [{ result: page([]) }];

  const { out, calls } = await fetchWithPages([...poisonedSequence, ...emptyTail]);

  const ids = out.jobs.map((j) => j.id);
  assert.ok(ids.includes('a') && ids.includes('b'), 'prefix jobs survive');
  assert.ok(ids.includes('poisoned'), 'poisoned job fetched without amount');
  assert.ok(ids.includes('c') && ids.includes('d'), 'pagination continues past the poisoned posting');

  // The poisoned job itself is fetched alone, without the amount selection.
  const poisonRetry = calls[3];
  assert.equal(poisonRetry.variables.filter.pagination_eq.first, 1);
  assert.ok(!poisonRetry.query.includes('amount {'));
  assert.ok(poisonRetry.query.includes('hourlyBudgetMin'));

  // The prefix retry requests only the edges before the poisoned index.
  assert.equal(calls[1].variables.filter.pagination_eq.first, 2);

  // Healthy requests still select amount.
  assert.ok(calls[1].query.includes('amount {'));
  assert.ok(calls[5].query.includes('amount {'));
});

test('fails through when the error is not a null-propagation failure', async () => {
  const script = [
    { error: { message: 'HTTP-ish failure', graphqlErrors: [{ message: 'nope', path: ['somethingElse'] }] } },
  ];
  await assert.rejects(() => fetchWithPages(script), /HTTP-ish failure/);
});
