import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createPlanningGoal,
  createPlanningProject,
  deletePlanningGoal,
  deletePlanningProject,
  loadPlanningBoard,
  updatePlanningGoal,
} from './planningStore.js';

test('persists directory-backed projects and outcome-oriented goals', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const projectDirectory = join(directory, 'project');
  const filePath = join(directory, 'planning.json');
  await mkdir(projectDirectory);

  const createdProject = await createPlanningProject({
    name: 'Test Project',
    directory: projectDirectory,
    description: 'A local test project.',
  }, { filePath });
  const project = createdProject.project;
  assert.equal(project.directory, projectDirectory);

  const createdGoal = await createPlanningGoal({
    projectId: project.id,
    title: 'Ship a verified result',
    outcome: 'The intended behavior is available to its user.',
    completionCriteria: 'The behavior works end to end and its tests pass.',
    nonGoals: 'No unrelated refactors.',
    status: 'planned',
    priority: 'high',
  }, { filePath });
  assert.equal(createdGoal.goal.status, 'planned');

  const moved = await updatePlanningGoal(createdGoal.goal.id, { status: 'in_progress' }, { filePath });
  assert.equal(moved.goal.status, 'in_progress');
  assert.equal(moved.goal.completionCriteria, 'The behavior works end to end and its tests pass.');

  await deletePlanningGoal(createdGoal.goal.id, { filePath });
  await deletePlanningProject(project.id, { filePath });
  const finalBoard = await loadPlanningBoard({ filePath });
  assert.equal(finalBoard.projects.length, 0);
  assert.equal(finalBoard.goals.length, 0);
});

test('rejects project paths that are not existing directories', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(
    createPlanningProject({ name: 'Missing', directory: join(directory, 'missing') }, { filePath: join(directory, 'planning.json') }),
    /ENOENT/,
  );
});
