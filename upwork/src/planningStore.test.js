import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createPlanningGoal,
  createPlanningProject,
  deletePlanningGoal,
  deletePlanningProject,
  loadPlanningBoard,
  updatePlanningGoal,
  updatePlanningProject,
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

test('only requires a title and assigns compact globally unique goal IDs', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'planning.json');
  const projects = [];
  for (const name of ['First', 'Second']) {
    const projectDirectory = join(directory, name.toLowerCase());
    await mkdir(projectDirectory);
    projects.push((await createPlanningProject({ name, directory: projectDirectory }, { filePath })).project);
  }

  const first = (await createPlanningGoal({ projectId: projects[0].id, title: 'First goal' }, { filePath })).goal;
  const second = (await createPlanningGoal({ projectId: projects[1].id, title: 'Second goal' }, { filePath })).goal;
  assert.deepEqual([first.id, second.id], ['1', '2']);
  assert.equal(first.outcome, '');
  assert.equal(first.completionCriteria, '');

  await deletePlanningGoal(second.id, { filePath });
  const third = (await createPlanningGoal({ projectId: projects[1].id, title: 'Third goal' }, { filePath })).goal;
  assert.equal(third.id, '3');
  await assert.rejects(createPlanningGoal({ projectId: projects[0].id }, { filePath }), /Goal title is required/);
});

test('migrates legacy goal UUIDs to stable compact IDs', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'planning.json');
  const projectDirectory = join(directory, 'project');
  await mkdir(projectDirectory);
  const project = (await createPlanningProject({ name: 'Project', directory: projectDirectory }, { filePath })).project;
  const board = await loadPlanningBoard({ filePath });
  board.version = 1;
  delete board.nextGoalId;
  board.goals = [{
    id: '993cf579-30b6-4ee4-abc0-91d730bdb397',
    projectId: project.id,
    title: 'Legacy goal',
    status: 'backlog',
    priority: 'no_priority',
    position: 0,
  }];
  await writeFile(filePath, JSON.stringify(board), 'utf8');

  const firstLoad = await loadPlanningBoard({ filePath });
  const secondLoad = await loadPlanningBoard({ filePath });
  assert.equal(firstLoad.version, 2);
  assert.equal(firstLoad.goals[0].id, '1');
  assert.equal(secondLoad.goals[0].id, '1');
  assert.equal(firstLoad.nextGoalId, 2);
});

test('persists reordered projects', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'planning.json');
  const projects = [];
  for (const name of ['First', 'Second', 'Third']) {
    const projectDirectory = join(directory, name.toLowerCase());
    await mkdir(projectDirectory);
    projects.push((await createPlanningProject({ name, directory: projectDirectory }, { filePath })).project);
  }

  await updatePlanningProject(projects[0].id, { position: 2 }, { filePath });
  const reordered = await loadPlanningBoard({ filePath });
  assert.deepEqual(reordered.projects.map((project) => project.name), ['Second', 'Third', 'First']);
});

test('stores home-relative project directories portably', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'planning.json');

  await createPlanningProject({ name: 'Home', directory: homedir() }, { filePath });
  const persisted = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(persisted.projects[0].directory, '~');

  const loaded = await loadPlanningBoard({ filePath });
  assert.equal(loaded.projects[0].directory, homedir());
});

test('rejects project paths that are not existing directories', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(
    createPlanningProject({ name: 'Missing', directory: join(directory, 'missing') }, { filePath: join(directory, 'planning.json') }),
    /ENOENT/,
  );
});
