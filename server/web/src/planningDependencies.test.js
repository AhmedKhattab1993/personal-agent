import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isDependencyOptionVisible,
  isGoalVisibleInAllProjects,
  isGoalVisibleInGraph,
  prioritizeSameProject,
  wouldCreateCycle,
} from './planningDependencies.js';

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

test('hides done and archived goals from dependency options', () => {
  assert.equal(isDependencyOptionVisible({ status: 'backlog' }), true);
  assert.equal(isDependencyOptionVisible({ status: 'in_progress' }), true);
  assert.equal(isDependencyOptionVisible({ status: 'done' }), false);
  assert.equal(isDependencyOptionVisible({ status: 'archived' }), false);
});

test('hides configured projects from all-project views', () => {
  const hiddenProjectIds = new Set(['msc']);

  assert.equal(isGoalVisibleInAllProjects({ projectId: 'personal-agent' }, hiddenProjectIds), true);
  assert.equal(isGoalVisibleInAllProjects({ projectId: 'msc' }, hiddenProjectIds), false);
});

test('hides done, archived, and canceled goals from the graph', () => {
  const hiddenProjectIds = new Set();

  assert.equal(isGoalVisibleInGraph({ projectId: 'p', status: 'backlog' }, hiddenProjectIds), true);
  assert.equal(isGoalVisibleInGraph({ projectId: 'p', status: 'done' }, hiddenProjectIds), false);
  assert.equal(isGoalVisibleInGraph({ projectId: 'p', status: 'archived' }, hiddenProjectIds), false);
  assert.equal(isGoalVisibleInGraph({ projectId: 'p', status: 'canceled' }, hiddenProjectIds), false);
});

test('lists same-project dependency options first without changing group order', () => {
  const options = [
    { id: '1', projectId: 'other' },
    { id: '2', projectId: 'current' },
    { id: '3', projectId: 'other' },
    { id: '4', projectId: 'current' },
  ];

  assert.deepEqual(
    prioritizeSameProject(options, 'current').map((goal) => goal.id),
    ['2', '4', '1', '3'],
  );
  assert.deepEqual(options.map((goal) => goal.id), ['1', '2', '3', '4']);
});
