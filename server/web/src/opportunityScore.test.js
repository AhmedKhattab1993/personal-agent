import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimateEconomicValue,
  estimateEffortHours,
  estimateOpportunity,
  filterJobsByPublishedHours,
  formatEconomicValue,
  formatOpportunityBadge,
  parseBudget,
  sortJobsForDisplay,
} from './opportunityScore.js';

const REFERENCE_TIME = '2026-08-02T12:00:00Z';

function completeJob(overrides = {}) {
  return {
    id: 'job',
    title: 'Automation opportunity',
    description: 'A clear implementation brief. '.repeat(30),
    budget: '40.0 - 100.0/hr',
    durationLabel: '1 to 3 months',
    engagement: '30+ hrs/week',
    experienceLevel: 'EXPERT',
    totalApplicants: 14,
    publishedDateTime: '2026-08-02T00:00:00Z',
    laneId: 'automation',
    laneMatches: ['workflow automation'],
    piClassification: { laneId: 'automation', rationale: 'Clear automation fit.' },
    skills: ['API Integration', 'Automation'],
    client: {
      hires: 30,
      postedJobs: 40,
      spent: '10000',
      feedback: 4.8,
      reviews: 10,
      verificationStatus: 'VERIFIED',
    },
    ...overrides,
  };
}

test('parses fixed and hourly Upwork budget labels', () => {
  assert.deepEqual(parseBudget('2,500.0'), {
    type: 'fixed',
    fixedPayment: 2500,
    min: 2500,
    max: 2500,
  });

  assert.deepEqual(parseBudget('50.0 - 100.0/hr'), {
    type: 'hourly',
    hourlyRate: 75,
    conservativeHourlyRate: 62.5,
    min: 50,
    max: 100,
  });
});

test('estimates lower effort for shorter jobs', () => {
  assert.equal(estimateEffortHours({
    durationLabel: 'Less than 1 month',
    engagement: null,
  }), 40);

  assert.equal(estimateEffortHours({
    durationLabel: '1 to 3 months',
    engagement: 'Less than 30 hrs/week',
  }), 160);
});

test('estimates conservative economics for hourly ranges and fixed-price work', () => {
  const hourly = estimateEconomicValue({
    budget: '20.0 - 125.0/hr',
    durationLabel: '1 to 3 months',
    engagement: '30+ hrs/week',
  });
  const fixed = estimateEconomicValue({
    budget: '1000.0',
    durationLabel: 'Less than 1 month',
    engagement: null,
  });

  assert.equal(hourly.hourlyEquivalent, 46.25);
  assert.equal(hourly.method, 'hourly_range_lower_quartile');
  assert.equal(fixed.effortHours, 60);
  assert.equal(fixed.hourlyEquivalent, 1000 / 60);
  assert.equal(fixed.method, 'fixed_budget_buffered_effort');
});

test('builds an explainable apply-priority score', () => {
  const estimate = estimateOpportunity(completeJob(), REFERENCE_TIME);

  assert.equal(estimate.rankable, true);
  assert.equal(estimate.score > 60, true);
  assert.deepEqual(Object.keys(estimate.components), [
    'fit', 'economics', 'winability', 'clientQuality', 'scopeConfidence',
  ]);
  assert.equal(estimate.riskPenalty, 1);
  assert.equal(estimate.confidence, 'high');
  assert.match(formatOpportunityBadge(estimate), /^Priority \d+\/100 · \$55\/hr est$/);
  assert.equal(formatEconomicValue(estimate.economic), '$55/hr est');
});

test('ranks a focused low-competition opportunity above a crowded wide range', () => {
  const crowded = completeJob({
    id: 'crowded',
    budget: '20.0 - 125.0/hr',
    totalApplicants: 121,
    client: { ...completeJob().client, hires: 20 },
  });
  const focused = completeJob({ id: 'focused' });

  const sorted = sortJobsForDisplay([crowded, focused], 'opportunity', REFERENCE_TIME);

  assert.deepEqual(sorted.map((job) => job.id), ['focused', 'crowded']);
  assert.equal(
    estimateOpportunity(focused, REFERENCE_TIME).score
      > estimateOpportunity(crowded, REFERENCE_TIME).score,
    true
  );
});

test('lets strong non-economic signals rank a missing-budget opportunity', () => {
  const weakRated = completeJob({
    id: 'weak-rated',
    budget: '5.0/hr',
    totalApplicants: 80,
    laneMatches: ['workflow automation'],
    client: {
      hires: 0,
      postedJobs: 0,
      spent: '0',
      feedback: 0,
      reviews: 0,
      verificationStatus: null,
    },
  });
  const strongUnrated = completeJob({
    id: 'strong-unrated',
    budget: null,
    totalApplicants: 1,
    laneMatches: ['workflow automation', 'API integration', 'n8n'],
    client: {
      hires: 50,
      postedJobs: 40,
      spent: '50000',
      feedback: 5,
      reviews: 20,
      verificationStatus: 'VERIFIED',
    },
  });

  const sorted = sortJobsForDisplay([weakRated, strongUnrated], 'opportunity', REFERENCE_TIME);

  assert.deepEqual(sorted.map((job) => job.id), ['strong-unrated', 'weak-rated']);
  assert.equal(estimateEconomicValue(strongUnrated).rankable, false);
  assert.equal(estimateOpportunity(strongUnrated, REFERENCE_TIME).rankable, true);
});

test('sorts highest estimated economics first and puts unknown economics last', () => {
  const high = completeJob({ id: 'high', budget: '80.0/hr' });
  const low = completeJob({ id: 'low', budget: '20.0/hr' });
  const unknown = completeJob({ id: 'unknown', budget: null });

  const sorted = sortJobsForDisplay([unknown, low, high], 'economic', REFERENCE_TIME);

  assert.deepEqual(sorted.map((job) => job.id), ['high', 'low', 'unknown']);
});

test('uses recency as the final tie-breaker', () => {
  const common = completeJob({ budget: null, totalApplicants: null });
  const sorted = sortJobsForDisplay([
    {
      ...common,
      id: 'older',
      title: 'Older',
      publishedDateTime: '2026-07-07T12:00:00Z',
    },
    {
      ...common,
      id: 'newer',
      title: 'Newer',
      publishedDateTime: '2026-07-08T12:00:00Z',
    },
  ], 'opportunity', REFERENCE_TIME);

  assert.deepEqual(sorted.map((job) => job.id), ['newer', 'older']);
});

test('filters jobs by selected published-hour window', () => {
  const jobs = [
    { id: 'within-1h', publishedDateTime: '2026-07-08T11:30:00Z' },
    { id: 'within-4h', publishedDateTime: '2026-07-08T09:00:00Z' },
    { id: 'within-24h', publishedDateTime: '2026-07-07T12:30:00Z' },
    { id: 'outside-24h', publishedDateTime: '2026-07-07T11:59:59Z' },
    { id: 'missing-date', publishedDateTime: null },
  ];

  assert.deepEqual(
    filterJobsByPublishedHours(jobs, 1, '2026-07-08T12:00:00Z').map((job) => job.id),
    ['within-1h']
  );

  assert.deepEqual(
    filterJobsByPublishedHours(jobs, 4, '2026-07-08T12:00:00Z').map((job) => job.id),
    ['within-1h', 'within-4h']
  );

  assert.deepEqual(
    filterJobsByPublishedHours(jobs, 24, '2026-07-08T12:00:00Z').map((job) => job.id),
    ['within-1h', 'within-4h', 'within-24h']
  );
});

test('keeps all jobs when the published-hour filter is invalid', () => {
  const jobs = [
    { id: 'a', publishedDateTime: '2026-07-08T11:30:00Z' },
    { id: 'b', publishedDateTime: null },
  ];

  assert.deepEqual(
    filterJobsByPublishedHours(jobs, 'all', '2026-07-08T12:00:00Z').map((job) => job.id),
    ['a', 'b']
  );
});
