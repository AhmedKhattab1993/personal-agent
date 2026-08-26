import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JOB_CLASSIFICATIONS,
  compactJob,
  normalizeJobClassification,
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
