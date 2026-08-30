import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlanningBoard } from './store.js';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const DEFAULT_FOCUS_FILE = join(APP_ROOT, 'data', 'focus-list.json');

function emptyFocusList() {
  return { version: 1, items: [], updatedAt: new Date().toISOString() };
}

async function readFocusFile(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    return { ...emptyFocusList(), ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch (error) {
    if (error.code === 'ENOENT') return emptyFocusList();
    throw error;
  }
}

async function saveFocusList(list, { filePath = DEFAULT_FOCUS_FILE } = {}) {
  const next = { ...list, version: 1, updatedAt: new Date().toISOString() };
  await mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return next;
}

// Goal-linked items stay in sync with the goal's title and notes: every load
// mirrors the goal onto the item so the focus list stays current, and an item
// whose goal was deleted detaches while keeping the last mirrored text.
function syncGoalLinks(items, board) {
  let changed = false;
  const goals = new Map(board.goals.map((goal) => [goal.id, goal]));
  const synced = items.map((item) => {
    if (!item.goalId) return item;
    const goal = goals.get(item.goalId);
    if (!goal) {
      changed = true;
      return { ...item, goalId: null, updatedAt: new Date().toISOString() };
    }
    if (item.title === goal.title && item.notes === (goal.notes ?? '')) return item;
    changed = true;
    return { ...item, title: goal.title, notes: goal.notes ?? '', updatedAt: new Date().toISOString() };
  });
  return { items: synced, changed };
}

async function loadFocusState({ filePath = DEFAULT_FOCUS_FILE, boardFilePath } = {}) {
  const list = await readFocusFile(filePath);
  const board = await loadPlanningBoard({ filePath: boardFilePath });
  const { items, changed } = syncGoalLinks(list.items, board);
  return {
    board,
    items: changed ? (await saveFocusList({ ...list, items }, { filePath })).items : items,
    list,
  };
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function loadFocusSnapshot(options = {}) {
  const { board, items } = await loadFocusState(options);
  const active = board.goals.filter((goal) => !['archived', 'canceled'].includes(goal.status));
  return {
    items,
    goals: active.map((goal) => ({
      id: goal.id,
      projectId: goal.projectId,
      title: goal.title,
      status: goal.status,
      priority: goal.priority,
      assignee: goal.assignee,
      notes: goal.notes ?? '',
      updatedAt: goal.updatedAt,
    })),
    projects: board.projects.map((project) => ({ id: project.id, name: project.name, color: project.color })),
  };
}

export async function createFocusItem(input, options = {}) {
  const { board, list, items } = await loadFocusState(options);
  const goalId = cleanText(input.goalId);
  const title = cleanText(input.title);
  let item;
  if (goalId) {
    const goal = board.goals.find((candidate) => candidate.id === goalId);
    if (!goal) throw new Error('Goal not found');
    item = { id: randomUUID(), goalId, title: goal.title, notes: goal.notes ?? '', done: false };
  } else {
    if (!title) throw new Error('Give the item a title or link a goal');
    item = { id: randomUUID(), goalId: null, title, notes: '', done: false };
  }
  const saved = await saveFocusList({ ...list, items: [item, ...items] }, options);
  return saved.items;
}

export async function updateFocusItem(itemId, input, options = {}) {
  const { list, items } = await loadFocusState(options);
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new Error('Focus item not found');
  const current = items[index];
  if (input.notes !== undefined && current.goalId) {
    throw new Error('This item syncs with its goal — edit the notes on the goal instead');
  }
  const title = input.title === undefined ? current.title : cleanText(input.title);
  if (!title) throw new Error('Item title is required');
  const updated = {
    ...current,
    title,
    notes: input.notes === undefined ? current.notes : cleanText(input.notes),
    done: input.done === undefined ? current.done : Boolean(input.done),
    updatedAt: new Date().toISOString(),
  };
  items[index] = updated;
  const saved = await saveFocusList({ ...list, items }, options);
  return saved.items;
}

export async function deleteFocusItem(itemId, options = {}) {
  const { list, items } = await loadFocusState(options);
  const remaining = items.filter((item) => item.id !== itemId);
  if (remaining.length === items.length) throw new Error('Focus item not found');
  const saved = await saveFocusList({ ...list, items: remaining }, options);
  return saved.items;
}

export async function reorderFocusItems(input, options = {}) {
  const { list, items } = await loadFocusState(options);
  const ids = Array.isArray(input.ids) ? input.ids : [];
  if (ids.length !== items.length || new Set(ids).size !== ids.length
    || items.some((item) => !ids.includes(item.id))) {
    throw new Error('Reorder needs every focus item id exactly once');
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const saved = await saveFocusList({ ...list, items: ids.map((id) => byId.get(id)) }, options);
  return saved.items;
}
