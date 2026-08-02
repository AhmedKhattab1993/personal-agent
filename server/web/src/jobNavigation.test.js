import assert from 'node:assert/strict';
import test from 'node:test';

import { findAdjacentJob, includeSelectedJobInNavigation } from './jobNavigation.js';

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

test('keeps a classified selected job in the sorted navigation order', () => {
  const selected = { id: 'second', rank: 2 };
  const visibleJobs = [{ id: 'third', rank: 3 }, { id: 'first', rank: 1 }];
  const navigationJobs = includeSelectedJobInNavigation(
    visibleJobs,
    selected,
    (jobs) => [...jobs].sort((a, b) => a.rank - b.rank),
  );

  assert.deepEqual(navigationJobs.map((job) => job.id), ['first', 'second', 'third']);
  assert.equal(findAdjacentJob(navigationJobs, selected.id, -1)?.id, 'first');
  assert.equal(findAdjacentJob(navigationJobs, selected.id, 1)?.id, 'third');
});
