import assert from 'node:assert/strict';
import test from 'node:test';

import { findAdjacentJob } from './jobNavigation.js';

const orderedJobs = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];

test('finds previous and next jobs in the supplied display order', () => {
  assert.equal(findAdjacentJob(orderedJobs, 'second', -1)?.id, 'first');
  assert.equal(findAdjacentJob(orderedJobs, 'second', 1)?.id, 'third');
});

test('returns no adjacent job at the ends or for an unknown selection', () => {
  assert.equal(findAdjacentJob(orderedJobs, 'first', -1), null);
  assert.equal(findAdjacentJob(orderedJobs, 'third', 1), null);
  assert.equal(findAdjacentJob(orderedJobs, 'missing', 1), null);
});
