import assert from 'node:assert/strict';
import test from 'node:test';

import { wouldCreateCycle } from './planningDependencies.js';

const goals = [
  { id: '1', dependsOn: [] },
  { id: '2', dependsOn: ['1'] },
  { id: '3', dependsOn: ['2'] },
];

test('allows an unsaved goal to depend on any existing goal', () => {
  assert.equal(wouldCreateCycle(goals, undefined, '1'), false);
  assert.equal(wouldCreateCycle(goals, undefined, '3'), false);
});

test('rejects self and transitive dependency cycles for an existing goal', () => {
  assert.equal(wouldCreateCycle(goals, '1', '1'), true);
  assert.equal(wouldCreateCycle(goals, '1', '3'), true);
  assert.equal(wouldCreateCycle(goals, '3', '1'), false);
});
