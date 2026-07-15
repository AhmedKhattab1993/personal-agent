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
  const missing = join(directory, 'missing');
  await assert.rejects(
    createPlanningProject({ name: 'Missing', directory: missing }, { filePath: join(directory, 'planning.json') }),
    new RegExp(`Directory does not exist: ${missing}`),
  );
});

test('rejects relative project paths with a correction instead of resolving from the server directory', async () => {
  await assert.rejects(
    createPlanningProject({ name: 'Missing slash', directory: 'home/ahmed/projects/example' }),
    /Directory must be an absolute or ~\/ path\. Did you mean “\/home\/ahmed\/projects\/example”\?/,
  );
});

test('reorders a goal upward within the same status', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const projectDirectory = join(directory, 'project');
  const filePath = join(directory, 'planning.json');
  await mkdir(projectDirectory);

  const { project } = await createPlanningProject({ name: 'P', directory: projectDirectory }, { filePath });
  const g1 = (await createPlanningGoal({ projectId: project.id, title: 'A' }, { filePath })).goal;
  const g2 = (await createPlanningGoal({ projectId: project.id, title: 'B' }, { filePath })).goal;
  const g3 = (await createPlanningGoal({ projectId: project.id, title: 'C' }, { filePath })).goal;

  // All three start at positions 0,1,2 in backlog
  // Move g3 (position 2) up to position 0
  const moved = await updatePlanningGoal(g3.id, { position: 0 }, { filePath });
  const positions = moved.board.goals
    .filter((g) => g.status === 'backlog')
    .sort((a, b) => a.position - b.position)
    .map((g) => ({ id: g.id, pos: g.position }));
  assert.equal(positions[0].id, g3.id);
  assert.equal(positions[1].id, g1.id);
  assert.equal(positions[2].id, g2.id);
  assert.deepEqual(positions.map((p) => p.pos), [0, 1, 2]);
});

test('reorders a goal downward within the same status', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const projectDirectory = join(directory, 'project');
  const filePath = join(directory, 'planning.json');
  await mkdir(projectDirectory);

  const { project } = await createPlanningProject({ name: 'P', directory: projectDirectory }, { filePath });
  const g1 = (await createPlanningGoal({ projectId: project.id, title: 'A' }, { filePath })).goal;
  const g2 = (await createPlanningGoal({ projectId: project.id, title: 'B' }, { filePath })).goal;
  const g3 = (await createPlanningGoal({ projectId: project.id, title: 'C' }, { filePath })).goal;

  // Move g1 (position 0) down to position 2
  const moved = await updatePlanningGoal(g1.id, { position: 2 }, { filePath });
  const positions = moved.board.goals
    .filter((g) => g.status === 'backlog')
    .sort((a, b) => a.position - b.position)
    .map((g) => ({ id: g.id, pos: g.position }));
  assert.equal(positions[0].id, g2.id);
  assert.equal(positions[1].id, g3.id);
  assert.equal(positions[2].id, g1.id);
  assert.deepEqual(positions.map((p) => p.pos), [0, 1, 2]);
});

test('appends to target status and normalizes source on cross-status move without position', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const projectDirectory = join(directory, 'project');
  const filePath = join(directory, 'planning.json');
  await mkdir(projectDirectory);

  const { project } = await createPlanningProject({ name: 'P', directory: projectDirectory }, { filePath });
  const g1 = (await createPlanningGoal({ projectId: project.id, title: 'A', status: 'backlog' }, { filePath })).goal;
  const g2 = (await createPlanningGoal({ projectId: project.id, title: 'B', status: 'backlog' }, { filePath })).goal;
  const g3 = (await createPlanningGoal({ projectId: project.id, title: 'C', status: 'planned' }, { filePath })).goal;

  // Move g1 from backlog (0,1) to planned (appended). Should: planned=[g3(0),g1(1)], backlog=[g2(0)]
  const moved = await updatePlanningGoal(g1.id, { status: 'planned' }, { filePath });

  const planned = moved.board.goals
    .filter((g) => g.status === 'planned')
    .sort((a, b) => a.position - b.position);
  assert.equal(planned.length, 2);
  assert.equal(planned[0].id, g3.id);
  assert.equal(planned[1].id, g1.id);
  assert.deepEqual(planned.map((p) => p.position), [0, 1]);

  const backlog = moved.board.goals
    .filter((g) => g.status === 'backlog')
    .sort((a, b) => a.position - b.position);
  assert.equal(backlog.length, 1);
  assert.equal(backlog[0].id, g2.id);
  assert.deepEqual(backlog.map((p) => p.position), [0]);
});

test('inserts at the requested position when moving across statuses', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const projectDirectory = join(directory, 'project');
  const filePath = join(directory, 'planning.json');
  await mkdir(projectDirectory);

  const { project } = await createPlanningProject({ name: 'P', directory: projectDirectory }, { filePath });
  const moving = (await createPlanningGoal({ projectId: project.id, title: 'Moving' }, { filePath })).goal;
  const first = (await createPlanningGoal({ projectId: project.id, title: 'First', status: 'planned' }, { filePath })).goal;
  const second = (await createPlanningGoal({ projectId: project.id, title: 'Second', status: 'planned' }, { filePath })).goal;

  const moved = await updatePlanningGoal(moving.id, { status: 'planned', position: 1 }, { filePath });
  const planned = moved.board.goals
    .filter((goal) => goal.status === 'planned')
    .sort((a, b) => a.position - b.position);
  assert.deepEqual(planned.map((goal) => goal.id), [first.id, moving.id, second.id]);
  assert.deepEqual(planned.map((goal) => goal.position), [0, 1, 2]);
});

test('preserves ordering on metadata-only update without position', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-board-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const projectDirectory = join(directory, 'project');
  const filePath = join(directory, 'planning.json');
  await mkdir(projectDirectory);

  const { project } = await createPlanningProject({ name: 'P', directory: projectDirectory }, { filePath });
  const g1 = (await createPlanningGoal({ projectId: project.id, title: 'A' }, { filePath })).goal;
  const g2 = (await createPlanningGoal({ projectId: project.id, title: 'B' }, { filePath })).goal;
  const g3 = (await createPlanningGoal({ projectId: project.id, title: 'C' }, { filePath })).goal;

  // Update title only — positions should remain 0,1,2 and order preserved
  const moved = await updatePlanningGoal(g2.id, { title: 'B-updated' }, { filePath });
  const siblings = moved.board.goals
    .filter((g) => g.status === 'backlog')
    .sort((a, b) => a.position - b.position)
    .map((g) => g.id);
  assert.deepEqual(siblings, [g1.id, g2.id, g3.id]);
  const goal2 = moved.board.goals.find((g) => g.id === g2.id);
  assert.equal(goal2.title, 'B-updated');
});
