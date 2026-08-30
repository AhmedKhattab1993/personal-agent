import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronDown, Focus as FocusIcon, GripVertical, Inbox, LayoutDashboard,
  Link2, Plus, Search, StickyNote, Target, Trash2, X,
} from 'lucide-react';

import { Badge, Button, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, Input } from './components/ui.jsx';

const GOAL_STATUSES = [
  { id: 'backlog', label: 'Backlog', color: '#78909d' },
  { id: 'planned', label: 'Ready', color: '#a991e8' },
  { id: 'in_progress', label: 'In progress', color: '#e3a35b' },
  { id: 'blocked', label: 'Blocked', color: '#ef8f8f' },
  { id: 'done', label: 'Done', color: '#65dfad' },
];
const STATUS_ORDER = new Map(GOAL_STATUSES.map((status, index) => [status.id, index]));
const NOTE_SAVE_DELAY_MS = 650;

async function api(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'The focus request failed');
  return payload;
}

// Collapses and expands its child with the grid-rows trick so both the open
// and the close transition animate even though the child mounts and unmounts.
function Collapsible({ open, children }) {
  const [rendered, setRendered] = useState(open);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
    const timer = setTimeout(() => setRendered(false), 240);
    return () => clearTimeout(timer);
  }, [open]);

  return <div className={`focus-note-wrap ${expanded ? 'expanded' : ''}`}>{rendered && children}</div>;
}

function NoteCard({ item, project, onSave }) {
  const [text, setText] = useState(item.notes);
  const [status, setStatus] = useState('idle');
  const latestRef = useRef({ item, onSave, text });
  latestRef.current = { item, onSave, text };

  const sync = item.goalId;
  const idleHint = sync ? 'Edits update the goal’s My notes' : 'Private to this list';

  // Debounced autosave. The server is the mirror for linked items, so the
  // incoming item.notes prop doubles as the saved-value marker.
  useEffect(() => {
    if (text === item.notes) return undefined;
    setStatus('saving');
    let canceled = false;
    const timer = setTimeout(async () => {
      try {
        await onSave(latestRef.current.item, text);
        if (!canceled) setStatus('saved');
      } catch {
        if (!canceled) setStatus('error');
      }
    }, NOTE_SAVE_DELAY_MS);
    return () => { canceled = true; clearTimeout(timer); };
  }, [text, item.notes, onSave]);

  // Flush an unsaved edit when the card closes or the item goes away.
  useEffect(() => () => {
    const { item: mountedItem, onSave: save, text: mountedText } = latestRef.current;
    if (mountedText !== mountedItem.notes) save(mountedItem, mountedText).catch(() => {});
  }, []);

  return (
    <section className={`focus-note ${sync ? 'synced' : ''}`} aria-label={`Notes for ${item.title}`}>
      <header>
        <StickyNote />
        <strong>{sync ? 'Goal notes' : 'Note'}</strong>
        {sync ? (
          <span className="focus-note-sync"><Link2 /> {project?.name ?? 'Planning board'}</span>
        ) : (
          <span className="focus-note-sync solo"><Inbox /> Only on this list</span>
        )}
      </header>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Add context, links, or the next concrete step…"
        aria-label="Note"
      />
      <footer>
        {status === 'saving' && <span>Saving…</span>}
        {status === 'saved' && <span className="saved">Saved</span>}
        {status === 'error' && <span className="failed">Save failed — retry your edit</span>}
        {status === 'idle' && <span>{idleHint}</span>}
      </footer>
    </section>
  );
}

export default function FocusView({ navigation }) {
  const [snapshot, setSnapshot] = useState({ items: [], goals: [], projects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [grabOpen, setGrabOpen] = useState(false);
  const [grabQuery, setGrabQuery] = useState('');
  const [openNoteId, setOpenNoteId] = useState(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [dragId, setDragId] = useState(null);
  const groupRefs = useRef(new Map());
  const dragRef = useRef(null);

  async function load() {
    setError(null);
    try { setSnapshot(await api('/api/planning/focus')); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const close = (event) => {
      if (event.key !== 'Escape') return;
      if (grabOpen) setGrabOpen(false);
      else setOpenNoteId(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [grabOpen]);

  const projectMap = useMemo(() => new Map(snapshot.projects.map((project) => [project.id, project])), [snapshot.projects]);
  const activeItems = useMemo(() => snapshot.items.filter((item) => !item.done), [snapshot.items]);
  const doneItems = useMemo(() => snapshot.items.filter((item) => item.done), [snapshot.items]);
  const completedCount = doneItems.length;
  const totalCount = snapshot.items.length;
  const progress = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const todayLabel = useMemo(() => new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()), []);

  const grabbableGoals = useMemo(() => {
    const linked = new Set(snapshot.items.filter((item) => item.goalId).map((item) => item.goalId));
    const query = grabQuery.trim().toLowerCase();
    return snapshot.goals
      .filter((goal) => !linked.has(goal.id))
      .filter((goal) => !query || [goal.title, projectMap.get(goal.projectId)?.name ?? '', `#${goal.id}`].join(' ').toLowerCase().includes(query))
      .sort((a, b) => (
        (projectMap.get(a.projectId)?.name ?? '').localeCompare(projectMap.get(b.projectId)?.name ?? '')
        || (STATUS_ORDER.get(a.status) ?? 99) - (STATUS_ORDER.get(b.status) ?? 99)
        || a.title.localeCompare(b.title)
      ));
  }, [snapshot.items, snapshot.goals, grabQuery, projectMap]);

  // Rebuilds goals and the linked-item mirrors from a planning-board payload,
  // keeping focus rows in step with goal edits made anywhere.
  const applyBoard = useCallback((board) => {
    setSnapshot((current) => ({
      items: current.items.map((item) => {
        if (!item.goalId) return item;
        const goal = board.goals.find((candidate) => candidate.id === item.goalId);
        if (!goal) return { ...item, goalId: null };
        return { ...item, title: goal.title, notes: goal.notes ?? '' };
      }),
      goals: board.goals
        .filter((goal) => !['archived', 'canceled'].includes(goal.status))
        .map((goal) => ({
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
    }));
  }, []);

  const saveNotes = useCallback(async (item, notes) => {
    if (item.goalId) {
      applyBoard(await api(`/api/planning/goals/${encodeURIComponent(item.goalId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      }));
      return;
    }
    const { items } = await api(`/api/planning/focus/items/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    setSnapshot((current) => ({ ...current, items }));
  }, [applyBoard]);

  async function addFromDraft(event) {
    event.preventDefault();
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const { items } = await api('/api/planning/focus/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      setSnapshot((current) => ({ ...current, items }));
      setDraft('');
    } catch (addError) { setError(addError.message); }
    finally { setBusy(false); }
  }

  async function grabGoal(goal) {
    if (busy) return;
    setBusy(true);
    try {
      const { items } = await api('/api/planning/focus/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: goal.id }),
      });
      setSnapshot((current) => ({ ...current, items }));
      setGrabOpen(false);
      setGrabQuery('');
    } catch (grabError) { setError(grabError.message); }
    finally { setBusy(false); }
  }

  async function toggleDone(item) {
    const previous = snapshot;
    const done = !item.done;
    setSnapshot((current) => ({ ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, done } : entry)) }));
    if (openNoteId === item.id) setOpenNoteId(null);
    try {
      const { items } = await api(`/api/planning/focus/items/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done }),
      });
      setSnapshot((current) => ({ ...current, items }));
    } catch (toggleError) { setSnapshot(previous); setError(toggleError.message); }
  }

  async function removeItem(item) {
    const previous = snapshot;
    setSnapshot((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) }));
    if (openNoteId === item.id) setOpenNoteId(null);
    try {
      await api(`/api/planning/focus/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    } catch (removeError) { setSnapshot(previous); setError(removeError.message); }
  }

  function moveDrag(clientY) {
    const state = dragRef.current;
    if (!state) return;
    const dragged = state.rects[state.startIndex];
    const draggedCenter = dragged.top + (clientY - state.startY) + dragged.height / 2;
    let target = state.startIndex;
    if (clientY - state.startY < 0) {
      for (let index = state.startIndex - 1; index >= 0; index -= 1) {
        const rect = state.rects[index];
        if (draggedCenter <= rect.top + rect.height / 2) target = index; else break;
      }
    } else {
      for (let index = state.startIndex + 1; index < state.rects.length; index += 1) {
        const rect = state.rects[index];
        if (draggedCenter >= rect.top + rect.height / 2) target = index; else break;
      }
    }
    state.targetIndex = target;
    const shift = dragged.height + state.gap;
    state.rects.forEach((rect, index) => {
      const element = groupRefs.current.get(rect.id);
      if (!element) return;
      if (index === state.startIndex) {
        element.style.transform = `translateY(${clientY - state.startY}px)`;
        return;
      }
      const offset = index > state.startIndex && index <= target ? -shift
        : index < state.startIndex && index >= target ? shift : 0;
      element.style.transform = offset ? `translateY(${offset}px)` : '';
    });
  }

  function finishDrag() {
    const state = dragRef.current;
    dragRef.current = null;
    setDragId(null);
    if (!state) return;
    state.rects.forEach((rect) => {
      const element = groupRefs.current.get(rect.id);
      if (element) element.style.transform = '';
    });
    if (state.targetIndex === state.startIndex) return;

    const ordered = activeItems.map((item) => item.id);
    const [moved] = ordered.splice(state.startIndex, 1);
    ordered.splice(state.targetIndex, 0, moved);
    const orderedIds = [...ordered, ...doneItems.map((item) => item.id)];
    const items = orderedIds.map((id) => snapshot.items.find((entry) => entry.id === id));
    const previous = snapshot;
    setSnapshot((current) => ({ ...current, items }));
    api('/api/planning/focus/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: orderedIds }),
    })
      .then(({ items: savedItems }) => setSnapshot((current) => ({ ...current, items: savedItems })))
      .catch((reorderError) => { setSnapshot(previous); setError(reorderError.message); });
  }

  function startDrag(event, item, index) {
    if (event.button !== 0) return;
    event.preventDefault();
    const rects = activeItems.map((active) => {
      const rect = groupRefs.current.get(active.id)?.getBoundingClientRect();
      return rect ? { id: active.id, top: rect.top, height: rect.height } : null;
    });
    if (rects.some((rect) => !rect)) return;
    const measured = rects.filter(Boolean);
    const gap = measured.length > 1 ? Math.max(0, measured[1].top - (measured[0].top + measured[0].height)) : 0;
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    dragRef.current = { rects: measured, gap, startIndex: index, targetIndex: index, startY: event.clientY };
    setDragId(item.id);
    const onMove = (moveEvent) => moveDrag(moveEvent.clientY);
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      finishDrag();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }

  function renderRow(item, index) {
    const goal = item.goalId ? snapshot.goals.find((candidate) => candidate.id === item.goalId) : null;
    const project = goal ? projectMap.get(goal.projectId) : null;
    const noteOpen = openNoteId === item.id;
    const toggleNote = () => setOpenNoteId(noteOpen ? null : item.id);
    return (
      <div
        key={item.id}
        className={`focus-row-group ${dragId === item.id ? 'dragging' : ''}`}
        ref={(element) => { if (element) groupRefs.current.set(item.id, element); else groupRefs.current.delete(item.id); }}
      >
        <article
          className={`focus-row ${item.done ? 'done' : ''} ${noteOpen ? 'note-open' : ''}`}
          onClick={(event) => { if (!event.target.closest('button')) toggleNote(); }}
          onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget) toggleNote(); }}
          tabIndex={0}
        >
          {item.done
            ? <span className="focus-drag ghost"><GripVertical /></span>
            : (
              <button
                type="button"
                className="focus-drag"
                aria-label={`Reorder ${item.title}`}
                onPointerDown={(event) => startDrag(event, item, index)}
              ><GripVertical /></button>
            )}
          <button
            type="button"
            className="focus-check"
            aria-pressed={item.done}
            aria-label={item.done ? `Reopen ${item.title}` : `Complete ${item.title}`}
            onClick={() => toggleDone(item)}
          >{item.done && <Check />}</button>
          <div className="focus-body">
            <h3>{item.title}</h3>
            <div className="focus-meta">
              {item.goalId && <span className="focus-goal" style={{ '--project-color': project?.color ?? '#fff' }}><i />{project?.name ?? 'Goal'}</span>}
              {item.notes && !noteOpen && <span className="focus-has-note" title="Has a note"><StickyNote /></span>}
            </div>
          </div>
          <button type="button" className="focus-remove" aria-label={`Remove ${item.title}`} onClick={() => removeItem(item)}><Trash2 /></button>
        </article>
        <Collapsible open={noteOpen}>
          <NoteCard key={item.id} item={item} project={project} onSave={saveNotes} />
        </Collapsible>
      </div>
    );
  }

  return (
    <main className="app-shell focus-shell">
      <div className="ambient-field" aria-hidden="true" />
      <div className="app-wrap focus-wrap">
        <header className="topbar">
          <div className="brand-lockup"><span className="brand-mark"><LayoutDashboard /></span><div><span className="eyebrow">Personal command center</span><strong>Personal Agent</strong></div></div>
          {navigation}
          <div className="topbar-actions"><span className="live-status"><i /> Local source</span></div>
        </header>

        {error && <div className="error-strip"><div><strong>Focus list needs attention</strong><span>{error}</span></div><button onClick={() => setError(null)} aria-label="Dismiss error"><X /></button></div>}

        {loading ? <div className="loading-state"><StickyNote /><span>Opening your focus list…</span></div> : (
          <>
            <section className="focus-hero">
              <Badge className="signal-badge"><FocusIcon /> Focus zen</Badge>
              <h1>{todayLabel}</h1>
              <p>One list. One thing at a time.</p>
              <div className="focus-progress" aria-label={`${completedCount} of ${totalCount} done`}>
                <div className="focus-progress-track"><i style={{ width: `${progress}%` }} /></div>
                <span>{totalCount ? `${completedCount} of ${totalCount} done` : 'Nothing here yet'}</span>
              </div>
            </section>

            <form className="focus-composer" onSubmit={addFromDraft}>
              <Plus />
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Add something to focus on…"
                aria-label="New focus item"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setGrabOpen(true)}><Target /> Grab a goal</Button>
            </form>

            {totalCount === 0 ? (
              <section className="focus-empty">
                <div className="focus-empty-orbit"><Inbox /></div>
                <h2>Your list is clear</h2>
                <p>Type above for a quick task, or grab a goal from your plans and its notes will follow you here.</p>
              </section>
            ) : (
              <section className={`focus-list ${dragId ? 'is-dragging' : ''}`} aria-label="Focus list">
                {activeItems.map((item, index) => renderRow(item, index))}
                {activeItems.length === 0 && <p className="focus-all-clear">Everything is done. Enjoy the quiet.</p>}
                {completedCount > 0 && (
                  <div className="focus-done">
                    <button type="button" className="focus-done-toggle" onClick={() => setDoneOpen((open) => !open)} aria-expanded={doneOpen}>
                      <Check />
                      <span>Completed</span>
                      <b>{completedCount}</b>
                      <ChevronDown className={doneOpen ? 'open' : ''} />
                    </button>
                    {doneOpen && doneItems.map((item, index) => renderRow(item, index))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <Dialog open={grabOpen}>
        <DialogContent className="focus-grab-dialog">
          <DialogHeader className="focus-grab-header">
            <div>
              <span className="section-kicker">From your plans</span>
              <DialogTitle>Grab a goal</DialogTitle>
              <p>Pull any active goal onto the list. Its title and notes stay synced with the planning board.</p>
            </div>
            <button type="button" className="dialog-close" onClick={() => setGrabOpen(false)} aria-label="Close"><X /></button>
          </DialogHeader>
          <DialogBody className="focus-grab-body">
            <div className="search-wrap"><Search /><Input value={grabQuery} onChange={(event) => setGrabQuery(event.target.value)} placeholder="Search goals…" aria-label="Search goals" />{grabQuery && <button type="button" onClick={() => setGrabQuery('')} aria-label="Clear search"><X /></button>}</div>
            <div className="focus-grab-list">
              {grabbableGoals.map((goal) => {
                const project = projectMap.get(goal.projectId);
                const status = GOAL_STATUSES.find((candidate) => candidate.id === goal.status);
                return (
                  <button key={goal.id} type="button" className="focus-grab-row" disabled={busy} onClick={() => grabGoal(goal)}>
                    <span className="focus-goal" style={{ '--project-color': project?.color ?? '#fff' }}><i />{project?.name ?? 'Goal'}</span>
                    <span className="focus-grab-title">{goal.title}</span>
                    <span className="focus-grab-meta">
                      {status && <span className="focus-status" style={{ '--status-color': status.color }}><i />{status.label}</span>}
                      <code>#{goal.id}</code>
                      <Plus />
                    </span>
                  </button>
                );
              })}
              {grabbableGoals.length === 0 && (
                <div className="focus-grab-empty"><Target /><span>{grabQuery ? 'No goals match that search.' : 'Every active goal is already on the list.'}</span></div>
              )}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </main>
  );
}
