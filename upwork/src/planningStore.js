import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_PLANNING_FILE = join(APP_ROOT, 'data', 'planning-board.json');
export const PLANNING_STATES = ['backlog', 'planned', 'in_progress', 'blocked', 'done', 'canceled'];
export const PLANNING_PRIORITIES = ['no_priority', 'low', 'medium', 'high', 'urgent'];

function emptyBoard() {
  return { version: 2, nextGoalId: 1, projects: [], goals: [], updatedAt: new Date().toISOString() };
}

function normalizeGoalIds(goals, storedNextGoalId) {
  const used = new Set();
  let nextGoalId = Number.isSafeInteger(storedNextGoalId) && storedNextGoalId > 0 ? storedNextGoalId : 1;
  const normalized = goals.map((goal) => {
    const id = typeof goal.id === 'string' ? goal.id : '';
    const numericId = /^[1-9][0-9a-z]*$/.test(id) ? Number.parseInt(id, 36) : 0;
    if (Number.isSafeInteger(numericId) && numericId > 0 && numericId.toString(36) === id && !used.has(id)) {
      used.add(id);
      nextGoalId = Math.max(nextGoalId, numericId + 1);
      return goal;
    }
    while (used.has(nextGoalId.toString(36))) nextGoalId += 1;
    const migrated = { ...goal, id: nextGoalId.toString(36) };
    used.add(migrated.id);
    nextGoalId += 1;
    return migrated;
  });
  return { goals: normalized, nextGoalId };
}

function allocateGoalId(board) {
  const used = new Set(board.goals.map((goal) => goal.id));
  let nextGoalId = Number.isSafeInteger(board.nextGoalId) && board.nextGoalId > 0 ? board.nextGoalId : 1;
  while (used.has(nextGoalId.toString(36))) nextGoalId += 1;
  const id = nextGoalId.toString(36);
  board.nextGoalId = nextGoalId + 1;
  return id;
}

function cleanText(value, { required = false, label = 'Value' } = {}) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) throw new Error(`${label} is required`);
  return result;
}

function expandDirectory(directory) {
  const value = cleanText(directory, { required: true, label: 'Directory' });
  return resolve(value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(), value.slice(2)) : value);
}

function persistDirectory(directory) {
  const home = homedir();
  return directory === home || directory.startsWith(`${home}/`)
    ? `~${directory.slice(home.length)}`
    : directory;
}

async function assertDirectory(directory) {
  const normalized = expandDirectory(directory);
  await access(normalized);
  const details = await stat(normalized);
  if (!details.isDirectory()) throw new Error('Directory must point to a folder on disk');
  return normalized;
}

export async function loadPlanningBoard({ filePath = DEFAULT_PLANNING_FILE } = {}) {
  try {
    const board = JSON.parse(await readFile(filePath, 'utf8'));
    const normalizedGoals = normalizeGoalIds(Array.isArray(board.goals) ? board.goals : [], board.nextGoalId);
    return {
      ...emptyBoard(),
      ...board,
      version: 2,
      nextGoalId: normalizedGoals.nextGoalId,
      projects: Array.isArray(board.projects)
        ? board.projects.map((project) => ({ ...project, directory: expandDirectory(project.directory) }))
        : [],
      goals: normalizedGoals.goals,
    };
  } catch (error) {
    if (error.code === 'ENOENT') return emptyBoard();
    throw error;
  }
}

async function savePlanningBoard(board, { filePath = DEFAULT_PLANNING_FILE } = {}) {
  const next = { ...board, updatedAt: new Date().toISOString() };
  await mkdir(dirname(filePath), { recursive: true });
  const persisted = {
    ...next,
    projects: next.projects.map((project) => ({
      ...project,
      directory: persistDirectory(project.directory),
    })),
  };
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
  await rename(temporary, filePath);
  return next;
}

export async function createPlanningProject(input, options = {}) {
  const board = await loadPlanningBoard(options);
  const directory = await assertDirectory(input.directory);
  if (board.projects.some((project) => project.directory === directory)) {
    throw new Error('A project already uses this directory');
  }
  const now = new Date().toISOString();
  const project = {
    id: randomUUID(),
    name: cleanText(input.name, { required: true, label: 'Project name' }),
    description: cleanText(input.description),
    directory,
    color: /^#[0-9a-f]{6}$/i.test(input.color ?? '') ? input.color : '#5ad9ca',
    createdAt: now,
    updatedAt: now,
  };
  board.projects.push(project);
  return { board: await savePlanningBoard(board, options), project };
}

export async function updatePlanningProject(projectId, input, options = {}) {
  const board = await loadPlanningBoard(options);
  const index = board.projects.findIndex((project) => project.id === projectId);
  if (index < 0) throw new Error('Project not found');
  const current = board.projects[index];
  const directory = input.directory === undefined ? current.directory : await assertDirectory(input.directory);
  if (board.projects.some((project) => project.id !== projectId && project.directory === directory)) {
    throw new Error('A project already uses this directory');
  }
  const project = {
    ...current,
    name: input.name === undefined ? current.name : cleanText(input.name, { required: true, label: 'Project name' }),
    description: input.description === undefined ? current.description : cleanText(input.description),
    directory,
    color: /^#[0-9a-f]{6}$/i.test(input.color ?? '') ? input.color : current.color,
    updatedAt: new Date().toISOString(),
  };
  board.projects[index] = project;
  if (Number.isFinite(input.position)) {
    const targetIndex = Math.max(0, Math.min(board.projects.length - 1, Math.trunc(input.position)));
    board.projects.splice(index, 1);
    board.projects.splice(targetIndex, 0, project);
  }
  return { board: await savePlanningBoard(board, options), project };
}

export async function deletePlanningProject(projectId, options = {}) {
  const board = await loadPlanningBoard(options);
  const index = board.projects.findIndex((project) => project.id === projectId);
  if (index < 0) throw new Error('Project not found');
  if (board.goals.some((goal) => goal.projectId === projectId)) {
    throw new Error('Delete or move this project’s goals before unlinking it');
  }
  const [project] = board.projects.splice(index, 1);
  return { board: await savePlanningBoard(board, options), project };
}

function validateGoalInput(input, board, current = {}) {
  const projectId = input.projectId ?? current.projectId;
  if (!board.projects.some((project) => project.id === projectId)) throw new Error('Choose a valid project');
  const status = input.status ?? current.status ?? 'backlog';
  if (!PLANNING_STATES.includes(status)) throw new Error('Invalid workflow state');
  const priority = input.priority ?? current.priority ?? 'no_priority';
  if (!PLANNING_PRIORITIES.includes(priority)) throw new Error('Invalid priority');
  return {
    projectId,
    status,
    priority,
    title: cleanText(input.title === undefined ? current.title : input.title, { required: true, label: 'Goal title' }),
    outcome: input.outcome === undefined ? (current.outcome ?? '') : cleanText(input.outcome),
    completionCriteria: input.completionCriteria === undefined ? (current.completionCriteria ?? '') : cleanText(input.completionCriteria),
    nonGoals: input.nonGoals === undefined ? (current.nonGoals ?? '') : cleanText(input.nonGoals),
  };
}

export async function createPlanningGoal(input, options = {}) {
  const board = await loadPlanningBoard(options);
  const now = new Date().toISOString();
  const fields = validateGoalInput(input, board);
  const siblings = board.goals.filter((goal) => goal.status === fields.status);
  const goal = { id: allocateGoalId(board), ...fields, position: siblings.length, createdAt: now, updatedAt: now };
  board.goals.push(goal);
  return { board: await savePlanningBoard(board, options), goal };
}

export async function updatePlanningGoal(goalId, input, options = {}) {
  const board = await loadPlanningBoard(options);
  const index = board.goals.findIndex((goal) => goal.id === goalId);
  if (index < 0) throw new Error('Goal not found');
  const current = board.goals[index];
  const fields = validateGoalInput(input, board, current);
  board.goals[index] = {
    ...current,
    ...fields,
    position: Number.isFinite(input.position) ? input.position : current.position,
    updatedAt: new Date().toISOString(),
  };
  return { board: await savePlanningBoard(board, options), goal: board.goals[index] };
}

export async function deletePlanningGoal(goalId, options = {}) {
  const board = await loadPlanningBoard(options);
  const index = board.goals.findIndex((goal) => goal.id === goalId);
  if (index < 0) throw new Error('Goal not found');
  const [goal] = board.goals.splice(index, 1);
  return { board: await savePlanningBoard(board, options), goal };
}
