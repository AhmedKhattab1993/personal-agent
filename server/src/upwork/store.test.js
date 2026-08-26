import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JOB_CLASSIFICATIONS,
  compactJob,
  isExcludedCompactJob,
  isExcludedRawJob,
  mergeApplicantCount,
  normalizeJobClassification,
  sweepRetainedWindowJobs,
  upworkApplyUrl,
} from './store.js';

test('normalizes supported Upwork job classifications', () => {
  assert.equal(normalizeJobClassification(undefined), null);
  assert.equal(normalizeJobClassification(null), null);
  assert.equal(normalizeJobClassification(JOB_CLASSIFICATIONS.APPLIED), 'applied');
  assert.equal(normalizeJobClassification(JOB_CLASSIFICATIONS.NOT_INTERESTED), 'not_interested');
  assert.throws(() => normalizeJobClassification('maybe'), /classification must be one of/);
});

test('builds the Upwork proposal apply URL from a job ciphertext', () => {
  assert.equal(
    upworkApplyUrl('~0123456789'),
    'https://www.upwork.com/ab/proposals/job/~0123456789/apply/'
  );
  assert.equal(upworkApplyUrl(null), null);
});

test('treats a reported applicant count of zero as not yet reported', () => {
  const job = compactJob({
    id: 'job-zero',
    ciphertext: '~0987654321',
    title: 'Fresh posting',
    description: 'Description',
    publishedDateTime: '2026-08-02T10:00:00Z',
    totalApplicants: 0,
    client: { location: {} },
    skills: [],
  }, {
    lane: { id: 'automation', label: 'Automation' },
    laneId: 'automation',
    laneLabel: 'Automation',
    matches: [],
  });
  assert.equal(job.totalApplicants, null);
});

test('keeps the last materialized applicant count when a refresh reports zero again', () => {
  const job = compactJob({
    id: 'job-zero',
    ciphertext: '~0987654321',
    title: 'Fresh posting',
    description: 'Description',
    publishedDateTime: '2026-08-02T10:00:00Z',
    totalApplicants: 0,
    client: { location: {} },
    skills: [],
  }, {
    lane: { id: 'automation', label: 'Automation' },
    laneId: 'automation',
    laneLabel: 'Automation',
    matches: [],
  }, { totalApplicants: 4 });
  assert.equal(job.totalApplicants, 4);
});

test('updates the applicant count when a re-poll reports a higher number', () => {
  const job = compactJob({
    id: 'job-counted',
    ciphertext: '~0987654322',
    title: 'Counted posting',
    description: 'Description',
    publishedDateTime: '2026-08-02T10:00:00Z',
    totalApplicants: 14,
    client: { location: {} },
    skills: [],
  }, {
    lane: { id: 'automation', label: 'Automation' },
    laneId: 'automation',
    laneLabel: 'Automation',
    matches: [],
  }, { totalApplicants: 4 });
  assert.equal(job.totalApplicants, 14);
});

test('keeps a materialized applicant count when compacting', () => {
  const job = compactJob({
    id: 'job-counted',
    ciphertext: '~0987654322',
    title: 'Counted posting',
    description: 'Description',
    publishedDateTime: '2026-08-02T10:00:00Z',
    totalApplicants: 4,
    client: { location: {} },
    skills: [],
  }, {
    lane: { id: 'automation', label: 'Automation' },
    laneId: 'automation',
    laneLabel: 'Automation',
    matches: [],
  });
  assert.equal(job.totalApplicants, 4);
});

test('excludes raw jobs whose source fixed budget is below the minimum', () => {
  const base = { client: { location: { country: 'Germany' } } };
  assert.equal(isExcludedRawJob({ ...base, amount: { rawValue: 299.99, currency: 'USD', displayValue: '299.99' } }), true);
  assert.equal(isExcludedRawJob({ ...base, amount: { rawValue: 300, currency: 'USD', displayValue: '300.0' } }), false);
  assert.equal(isExcludedRawJob({ ...base, amount: { rawValue: 5000, currency: 'USD', displayValue: '5000.0' } }), false);
  // Hourly postings report no usable fixed amount and must stay visible.
  assert.equal(isExcludedRawJob({ ...base, amount: null, hourlyBudgetMin: { rawValue: 30, displayValue: '30.00' } }), false);
  assert.equal(isExcludedRawJob({ ...base, amount: { rawValue: 0, currency: 'USD', displayValue: '0.0' } }), false);
  assert.equal(isExcludedRawJob(base), false);
});

test('excludes cached jobs whose stored fixed budget is below the minimum', () => {
  assert.equal(isExcludedCompactJob({ client: { country: 'Germany' }, budget: '75.0' }), true);
  assert.equal(isExcludedCompactJob({ client: { country: 'Germany' }, budget: '1,200.0' }), false);
  assert.equal(isExcludedCompactJob({ client: { country: 'Germany' }, budget: '30.00 - 60.00/hr' }), false);
  assert.equal(isExcludedCompactJob({ client: { country: 'Germany' }, budget: null }), false);
});

test('merges applicant counts monotonically across flapping replicas', () => {
  assert.equal(mergeApplicantCount(14, 4), 14);
  assert.equal(mergeApplicantCount(0, 4), 4);
  assert.equal(mergeApplicantCount(0, null), null);
  assert.equal(mergeApplicantCount(7, null), 7);
});

test('sweep re-polls missed window jobs and keeps delisted ones unchanged', async () => {
  const candidates = [
    { id: '1', title: 'Live job', totalApplicants: 2, lastSeenAt: '2026-08-25T00:00:00Z' },
    { id: '2', title: 'Delisted job', totalApplicants: 5, lastSeenAt: '2026-08-25T00:00:00Z' },
    { id: '3', title: 'Never reported', totalApplicants: null, lastSeenAt: '2026-08-25T00:00:00Z' },
  ];
  const lookup = async (job) => ({
    1: { id: '1', totalApplicants: 9 },
    2: null,
    3: { id: '3', totalApplicants: 0 },
  })[job.id];
  const swept = await sweepRetainedWindowJobs(candidates, lookup, '2026-08-26T00:00:00Z');
  const byId = new Map(swept.map((job) => [job.id, job]));
  assert.equal(byId.get('1').totalApplicants, 9);
  assert.equal(byId.get('1').lastSeenAt, '2026-08-26T00:00:00Z');
  assert.equal(byId.has('2'), false, 'delisted job is not swept');
  assert.equal(byId.get('3').totalApplicants, null, 'zero stays unknown');
});

test('preserves a job classification when compacting refreshed Upwork data', () => {
  const refreshed = compactJob({
    id: 'job-1',
    ciphertext: '~0123456789',
    title: 'Refreshed job',
    description: 'Updated description',
    publishedDateTime: '2026-08-02T10:00:00Z',
    client: { location: {} },
    skills: [],
  }, {
    lane: { id: 'automation', label: 'Automation' },
    laneId: 'automation',
    laneLabel: 'Automation',
    matches: [],
    matchedLanes: [],
    relevant: true,
  }, {
    id: 'job-1',
    classification: JOB_CLASSIFICATIONS.APPLIED,
    firstSeenAt: '2026-08-01T10:00:00Z',
    seenCount: 2,
  }, '2026-08-02T10:01:00Z');

  assert.equal(refreshed.classification, JOB_CLASSIFICATIONS.APPLIED);
  assert.equal(refreshed.url, 'https://www.upwork.com/ab/proposals/job/~0123456789/apply/');
  assert.equal(refreshed.firstSeenAt, '2026-08-01T10:00:00Z');
  assert.equal(refreshed.seenCount, 3);
});
