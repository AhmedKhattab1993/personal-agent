import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createPlanningGoal, createPlanningProject, deletePlanningGoal, updatePlanningGoal } from './store.js';
import {
  createFocusItem,
  deleteFocusItem,
  loadFocusSnapshot,
  reorderFocusItems,
  updateFocusItem,
} from './focusStore.js';

function focusOptions(directory) {
  return { filePath: join(directory, 'focus.json'), boardFilePath: join(directory, 'board.json') };
}

async function boardWithGoal(directory, goalInput = { title: 'Ship the release' }) {
  const options = focusOptions(directory);
  const { project } = await createPlanningProject({ name: 'Test Project' }, { filePath: options.boardFilePath });
  const { goal } = await createPlanningGoal({ projectId: project.id, notes: 'Goal notes.', ...goalInput }, { filePath: options.boardFilePath });
  return { options, goal };
}

test('creates custom items at the top and updates, completes, and deletes them', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'focus-list-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const options = focusOptions(directory);

  await assert.rejects(createFocusItem({}, options), /title or link a goal/);

  const first = (await createFocusItem({ title: 'Morning review' }, options))[0];
  const second = (await createFocusItem({ title: 'Deep work block' }, options))[0];
  assert.equal(first.title, 'Morning review');
  assert.equal(second.goalId, null);
  assert.deepEqual((await loadFocusSnapshot(options)).items.map((item) => item.title), ['Deep work block', 'Morning review']);

  const renamed = (await updateFocusItem(first.id, { title: 'Evening review', notes: 'Check the ledger.' }, options))
    .find((item) => item.id === first.id);
  assert.equal(renamed.title, 'Evening review');
  assert.equal(renamed.notes, 'Check the ledger.');

  const completed = (await updateFocusItem(first.id, { done: true }, options)).find((item) => item.id === first.id);
  assert.equal(completed.done, true);

  const afterDelete = await deleteFocusItem(second.id, options);
  assert.deepEqual(afterDelete.map((item) => item.id), [first.id]);
  await assert.rejects(deleteFocusItem(second.id, options), /not found/);
});

test('goal-linked items mirror goal title and notes and reject direct note edits', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'focus-list-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const { options, goal } = await boardWithGoal(directory);

  const linked = (await createFocusItem({ goalId: goal.id }, options))[0];
  assert.equal(linked.goalId, goal.id);
  assert.equal(linked.title, 'Ship the release');
  assert.equal(linked.notes, 'Goal notes.');
  await assert.rejects(createFocusItem({ goalId: 'nope' }, options), /Goal not found/);
  await assert.rejects(updateFocusItem(linked.id, { notes: 'Local edit' }, options), /syncs with its goal/);

  await updatePlanningGoal(goal.id, { notes: 'Revised on the goal dialog.' }, { filePath: options.boardFilePath });
  const mirrored = (await loadFocusSnapshot(options)).items.find((item) => item.id === linked.id);
  assert.equal(mirrored.notes, 'Revised on the goal dialog.');

  const checked = (await updateFocusItem(linked.id, { done: true }, options)).find((item) => item.id === linked.id);
  assert.equal(checked.done, true);
});

test('deleting the goal detaches the item while keeping the last mirrored text', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'focus-list-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const { options, goal } = await boardWithGoal(directory);

  const linked = (await createFocusItem({ goalId: goal.id }, options))[0];
  await deletePlanningGoal(goal.id, { filePath: options.boardFilePath });

  const detached = (await loadFocusSnapshot(options)).items.find((item) => item.id === linked.id);
  assert.equal(detached.goalId, null);
  assert.equal(detached.title, 'Ship the release');
  assert.equal(detached.notes, 'Goal notes.');

  const retitled = (await updateFocusItem(linked.id, { title: 'Carry the work forward' }, options))
    .find((item) => item.id === linked.id);
  assert.equal(retitled.title, 'Carry the work forward');
});

test('reorder needs every id exactly once and persists the new order', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'focus-list-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const options = focusOptions(directory);

  const items = [];
  for (const title of ['One', 'Two', 'Three']) items.push((await createFocusItem({ title }, options))[0]);

  await assert.rejects(reorderFocusItems({ ids: items.map((item) => item.id).slice(1) }, options), /exactly once/);
  await assert.rejects(reorderFocusItems({ ids: [items[0].id, items[0].id, items[1].id] }, options), /exactly once/);

  const reordered = await reorderFocusItems({ ids: [items[2].id, items[0].id, items[1].id] }, options);
  assert.deepEqual(reordered.map((item) => item.title), ['Three', 'One', 'Two']);
  assert.deepEqual((await loadFocusSnapshot(options)).items.map((item) => item.title), ['Three', 'One', 'Two']);
});
