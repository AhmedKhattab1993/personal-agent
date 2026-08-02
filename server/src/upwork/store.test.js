import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JOB_CLASSIFICATIONS,
  compactJob,
  normalizeJobClassification,
} from './store.js';

test('normalizes supported Upwork job classifications', () => {
  assert.equal(normalizeJobClassification(undefined), null);
  assert.equal(normalizeJobClassification(null), null);
  assert.equal(normalizeJobClassification(JOB_CLASSIFICATIONS.APPLIED), 'applied');
  assert.equal(normalizeJobClassification(JOB_CLASSIFICATIONS.NOT_INTERESTED), 'not_interested');
  assert.throws(() => normalizeJobClassification('maybe'), /classification must be one of/);
});

test('preserves a job classification when compacting refreshed Upwork data', () => {
  const refreshed = compactJob({
    id: 'job-1',
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
  assert.equal(refreshed.firstSeenAt, '2026-08-01T10:00:00Z');
  assert.equal(refreshed.seenCount, 3);
});
