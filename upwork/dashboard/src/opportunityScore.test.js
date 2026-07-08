import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimateEffortHours,
  estimateOpportunity,
  parseBudget,
  sortJobsForDisplay,
} from './opportunityScore.js';

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

test('scores expected payment per estimated hour of work', () => {
  const shortFixed = estimateOpportunity({
    budget: '1000.0',
    durationLabel: 'Less than 1 month',
    engagement: null,
  });

  const longFixed = estimateOpportunity({
    budget: '5000.0',
    durationLabel: 'More than 6 months',
    engagement: null,
  });

  assert.equal(shortFixed.rankable, true);
  assert.equal(shortFixed.score, 25);
  assert.equal(longFixed.score < shortFixed.score, true);
});

test('sorts highest opportunity before newest fallback', () => {
  const sorted = sortJobsForDisplay([
    {
      id: 'new-low',
      title: 'Newest low value',
      budget: '100.0',
      durationLabel: 'Less than 1 month',
      publishedDateTime: '2026-07-08T12:00:00Z',
    },
    {
      id: 'old-high',
      title: 'Older high value',
      budget: '50.0 - 100.0/hr',
      durationLabel: '1 to 3 months',
      engagement: 'Less than 30 hrs/week',
      publishedDateTime: '2026-07-07T12:00:00Z',
    },
    {
      id: 'unknown',
      title: 'Unknown budget',
      budget: null,
      durationLabel: 'Less than 1 month',
      publishedDateTime: '2026-07-09T12:00:00Z',
    },
  ], 'opportunity');

  assert.deepEqual(sorted.map((job) => job.id), ['old-high', 'new-low', 'unknown']);
});

test('keeps unrated jobs behind scored jobs and orders them by recency', () => {
  const sorted = sortJobsForDisplay([
    {
      id: 'older-unknown',
      title: 'Older unknown',
      budget: null,
      publishedDateTime: '2026-07-07T12:00:00Z',
    },
    {
      id: 'ranked',
      title: 'Ranked',
      budget: '500.0',
      durationLabel: 'Less than 1 month',
      publishedDateTime: '2026-07-06T12:00:00Z',
    },
    {
      id: 'newer-unknown',
      title: 'Newer unknown',
      budget: null,
      publishedDateTime: '2026-07-08T12:00:00Z',
    },
  ], 'opportunity');

  assert.deepEqual(sorted.map((job) => job.id), ['ranked', 'newer-unknown', 'older-unknown']);
});
