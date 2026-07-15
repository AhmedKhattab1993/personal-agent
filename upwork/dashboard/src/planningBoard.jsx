import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, ArrowRight, Bot, Check, CheckCircle2, Circle, Clipboard,
  Clock3, Code2, Copy, Folder, FolderGit2, GripVertical, LayoutDashboard,
  FileSearch, FolderOpen, PauseCircle, Pencil, Plus, Search, Send, ShieldCheck, Sparkles,
  Target, Trash2, X, Zap,
} from 'lucide-react';

import { Badge, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Select } from './components/ui.jsx';

const STATES = [
  { id: 'backlog', label: 'Backlog', icon: Archive, color: '#78909d' },
  { id: 'planned', label: 'Ready', icon: Circle, color: '#a991e8' },
  { id: 'in_progress', label: 'In progress', icon: Zap, color: '#e3a35b' },
  { id: 'blocked', label: 'Blocked', icon: PauseCircle, color: '#ef8f8f' },
  { id: 'done', label: 'Done', icon: CheckCircle2, color: '#65dfad' },
];

const PRIORITIES = [
  { id: 'no_priority', label: 'No priority' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' },
];

const EMPTY_PROJECT = { name: '', description: '', directory: '', color: '#5ad9ca' };
const EMPTY_GOAL = { projectId: '', title: '', outcome: '', completionCriteria: '', nonGoals: '', priority: 'no_priority', status: 'backlog' };
const GOAL_FIELDS = ['title', 'outcome', 'completionCriteria', 'nonGoals', 'priority', 'status'];

function assistantWelcome(project) {
  return {
    role: 'assistant',
    content: `I’m ready to help define this goal. I can inspect ${project?.name ?? 'the selected project'} in read-only mode, ground the outcome in what exists, and fill the form as we refine it. What change do you want to make true?`,
  };
}

async function api(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'The planning board request failed');
  return payload;
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'P';
}

function relativeDate(value) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function agentBrief(goal, project) {
  return [
    `Working directory: ${project.directory}`,
    '',
    `Goal: ${goal.title}`,
    '',
    `Desired outcome: ${goal.outcome || 'Not specified.'}`,
    '',
    'Definition of done:',
    goal.completionCriteria || 'Not specified.',
    '',
    'Out of scope / ignore:',
    goal.nonGoals || 'Nothing specified.',
    '',
    'Work out the implementation approach from the repository truth. Verify the definition of done before handing back.',
  ].join('\n');
}

function Field({ label, hint, children }) {
  return <label className="planning-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function goalsInStatus(goals, status) {
  return goals
    .map((goal, index) => ({ goal, index }))
    .filter(({ goal }) => goal.status === status)
    .sort((a, b) => ((a.goal.position ?? 0) - (b.goal.position ?? 0)) || (a.index - b.index))
    .map(({ goal }) => goal);
}

function reorderGoals(goals, goalId, status, position) {
  const moving = goals.find((goal) => goal.id === goalId);
  if (!moving) return goals;
  const sourceStatus = moving.status;
  const targetGoals = goalsInStatus(goals.filter((goal) => goal.id !== goalId), status);
  const targetIndex = Math.max(0, Math.min(targetGoals.length, Math.trunc(position)));
  targetGoals.splice(targetIndex, 0, { ...moving, status });

  const updates = new Map(targetGoals.map((goal, index) => [goal.id, { status, position: index }]));
  if (sourceStatus !== status) {
    goalsInStatus(goals.filter((goal) => goal.id !== goalId), sourceStatus)
      .forEach((goal, index) => updates.set(goal.id, { status: sourceStatus, position: index }));
  }
  return goals.map((goal) => updates.has(goal.id) ? { ...goal, ...updates.get(goal.id) } : goal);
}

export default function PlanningBoard({ navigation }) {
  const [board, setBoard] = useState({ projects: [], goals: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [projectFilter, setProjectFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [projectDialog, setProjectDialog] = useState(false);
  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT);
  const [editingProject, setEditingProject] = useState(null);
  const [goalDialog, setGoalDialog] = useState(false);
  const [goalForm, setGoalForm] = useState(EMPTY_GOAL);
  const [editingGoal, setEditingGoal] = useState(null);
  const [draggedProject, setDraggedProject] = useState(null);
  const [draggedGoal, setDraggedGoal] = useState(null);
  const [goalDropTarget, setGoalDropTarget] = useState(null);
  const [copiedGoal, setCopiedGoal] = useState(null);
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState(null);
  const [assistantEvidence, setAssistantEvidence] = useState(null);
  const [appliedFields, setAppliedFields] = useState([]);
  const [assistantModel, setAssistantModel] = useState('zai/glm-5.2');

  async function loadBoard() {
    setError(null);
    try { setBoard(await api('/api/planning')); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadBoard(); }, []);

  const projectMap = useMemo(() => Object.fromEntries(board.projects.map((project) => [project.id, project])), [board.projects]);
  const visibleGoals = useMemo(() => board.goals.filter((goal) => {
    if (goal.status === 'canceled') return false;
    if (projectFilter !== 'all' && goal.projectId !== projectFilter) return false;
    if (!query.trim()) return true;
    return [goal.id, goal.title, goal.outcome, goal.completionCriteria, goal.nonGoals, projectMap[goal.projectId]?.name].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  }), [board.goals, projectFilter, query, projectMap]);

  const counts = useMemo(() => Object.fromEntries(STATES.map((state) => [state.id, visibleGoals.filter((goal) => goal.status === state.id).length])), [visibleGoals]);
  const activeCount = board.goals.filter((goal) => goal.status === 'in_progress').length;
  const readyCount = board.goals.filter((goal) => goal.status === 'planned').length;
  const doneCount = board.goals.filter((goal) => goal.status === 'done').length;

  function resetAssistant(projectId) {
    const project = board.projects.find((item) => item.id === projectId);
    setAssistantMessages([assistantWelcome(project)]);
    setAssistantInput(''); setAssistantError(null); setAssistantEvidence(null); setAppliedFields([]);
  }

  function openNewGoal(status = 'backlog') {
    if (!board.projects.length) { setEditingProject(null); setProjectForm(EMPTY_PROJECT); setProjectDialog(true); return; }
    setEditingGoal(null);
    const projectId = projectFilter === 'all' ? board.projects[0].id : projectFilter;
    setGoalForm({ ...EMPTY_GOAL, projectId, status });
    resetAssistant(projectId);
    setGoalDialog(true);
  }

  function openGoal(goal) {
    setEditingGoal(goal);
    setGoalForm({ ...EMPTY_GOAL, ...goal });
    resetAssistant(goal.projectId);
    setGoalDialog(true);
  }

  async function sendGoalAssistant(message = assistantInput) {
    const content = message.trim();
    if (!content || assistantLoading || !goalForm.projectId) return;
    const userMessage = { role: 'user', content };
    const nextMessages = [...assistantMessages, userMessage];
    setAssistantMessages(nextMessages); setAssistantInput(''); setAssistantLoading(true); setAssistantError(null); setAppliedFields([]);
    try {
      const result = await api('/api/planning/goal-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: goalForm.projectId, messages: nextMessages, draft: goalForm }),
      });
      const updates = Object.fromEntries(GOAL_FIELDS.filter((field) => result.updates?.[field] !== null && result.updates?.[field] !== undefined).map((field) => [field, result.updates[field]]));
      setGoalForm((current) => ({ ...current, ...updates }));
      setAppliedFields(Object.keys(updates));
      setAssistantEvidence(result.investigation);
      setAssistantModel(result.model ?? 'zai/glm-5.2');
      setAssistantMessages((current) => [...current, { role: 'assistant', content: result.reply }]);
    } catch (chatError) {
      setAssistantError(chatError.message);
    } finally {
      setAssistantLoading(false);
    }
  }

  async function submitProject(event) {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      const path = editingProject ? `/api/planning/projects/${encodeURIComponent(editingProject.id)}` : '/api/planning/projects';
      const next = await api(path, { method: editingProject ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectForm) });
      setBoard(next); setProjectFilter(editingProject?.id ?? next.projects.at(-1)?.id ?? 'all'); setProjectDialog(false); setProjectForm(EMPTY_PROJECT); setEditingProject(null);
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  }

  async function chooseProjectDirectory() {
    setError(null);
    try {
      const result = await api('/api/planning/choose-directory');
      if (!result.canceled) setProjectForm((current) => ({ ...current, directory: result.directory }));
    } catch (pickerError) { setError(pickerError.message); }
  }

  function openProject(project = null) {
    setEditingProject(project);
    setProjectForm(project ? { name: project.name, description: project.description, directory: project.directory, color: project.color } : EMPTY_PROJECT);
    setProjectDialog(true);
  }

  async function unlinkProject() {
    if (!editingProject || !window.confirm(`Unlink “${editingProject.name}”? The directory on disk will not be changed.`)) return;
    try {
      setBoard(await api(`/api/planning/projects/${encodeURIComponent(editingProject.id)}`, { method: 'DELETE' }));
      setProjectFilter('all'); setProjectDialog(false); setEditingProject(null);
    } catch (unlinkError) { setError(unlinkError.message); }
  }

  async function submitGoal(event) {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      const path = editingGoal ? `/api/planning/goals/${encodeURIComponent(editingGoal.id)}` : '/api/planning/goals';
      const next = await api(path, { method: editingGoal ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(goalForm) });
      setBoard(next); setGoalDialog(false); setEditingGoal(null);
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  }

  async function moveProject(projectId, targetId) {
    if (!projectId || projectId === targetId) return;
    const previous = board;
    const sourceIndex = board.projects.findIndex((project) => project.id === projectId);
    const targetIndex = board.projects.findIndex((project) => project.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const projects = [...board.projects];
    const [project] = projects.splice(sourceIndex, 1);
    projects.splice(targetIndex, 0, project);
    setBoard((current) => ({ ...current, projects }));
    try {
      setBoard(await api(`/api/planning/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: targetIndex }),
      }));
    } catch (moveError) {
      setBoard(previous);
      setError(moveError.message);
    }
  }

  async function moveGoal(goal, status, position) {
    const currentOrder = goalsInStatus(board.goals, goal.status);
    if (goal.status === status && currentOrder.findIndex((item) => item.id === goal.id) === position) return;
    const previous = board;
    setBoard((current) => ({ ...current, goals: reorderGoals(current.goals, goal.id, status, position) }));
    try {
      setBoard(await api(`/api/planning/goals/${encodeURIComponent(goal.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, position }),
      }));
    } catch (moveError) { setBoard(previous); setError(moveError.message); }
  }

  function goalDropPosition(event, goal, status) {
    const goals = goalsInStatus(board.goals, status);
    const targetIndex = goals.findIndex((item) => item.id === goal.id);
    const sourceIndex = draggedGoal?.status === status ? goals.findIndex((item) => item.id === draggedGoal.id) : -1;
    const afterTarget = event.clientY >= event.currentTarget.getBoundingClientRect().top + (event.currentTarget.offsetHeight / 2);
    let position = targetIndex + (afterTarget ? 1 : 0);
    if (sourceIndex >= 0 && sourceIndex < position) position -= 1;
    return { position, edge: afterTarget ? 'after' : 'before' };
  }

  async function removeGoal(goal) {
    if (!window.confirm(`Delete “${goal.title}”?`)) return;
    try { setBoard(await api(`/api/planning/goals/${encodeURIComponent(goal.id)}`, { method: 'DELETE' })); setGoalDialog(false); }
    catch (deleteError) { setError(deleteError.message); }
  }

  async function copyBrief(goal) {
    await navigator.clipboard.writeText(agentBrief(goal, projectMap[goal.projectId]));
    setCopiedGoal(goal.id); setTimeout(() => setCopiedGoal(null), 1600);
  }

  return (
    <main className="app-shell planning-shell">
      <div className="ambient-field" aria-hidden="true" />
      <div className="dashboard-wrap planning-wrap">
        <header className="topbar">
          <div className="brand-lockup"><span className="brand-mark"><LayoutDashboard /></span><div><span className="eyebrow">Personal command center</span><strong>Agent Dashboard</strong></div></div>
          {navigation}
          <div className="topbar-actions"><span className="live-status"><i /> Local source</span><Button className="refresh-button" onClick={() => openNewGoal()}><Plus /><span>Define goal</span></Button></div>
        </header>

        <section className="planning-hero">
          <div><Badge className="signal-badge"><Target /> Outcome planning</Badge><h1>Plan the <em>destination.</em><br />Let agents find the route.</h1><p>Define what must be true when work is complete, anchor it to a real project directory, and keep implementation details out of the brief.</p></div>
          <div className="planning-summary">
            <div><span>Ready</span><strong>{readyCount}</strong><small>clear to pick up</small></div>
            <div><span>In flight</span><strong>{activeCount}</strong><small>being executed</small></div>
            <div><span>Completed</span><strong>{doneCount}</strong><small>verified outcomes</small></div>
          </div>
        </section>

        {error && <div className="error-strip"><AlertCircle /><div><strong>Planning board needs attention</strong><span>{error}</span></div><button onClick={() => setError(null)}><X /></button></div>}

        <section className="planning-toolbar">
          <div className="project-switcher">
            <button className={projectFilter === 'all' ? 'active' : ''} onClick={() => setProjectFilter('all')}><span className="project-avatar all"><FolderGit2 /></span><span><strong>All projects</strong><small>{board.projects.length} linked directories</small></span></button>
            {board.projects.map((project) => <button
              key={project.id}
              className={`project-tab ${projectFilter === project.id ? 'active' : ''} ${draggedProject === project.id ? 'dragging' : ''}`}
              draggable
              onDragStart={(event) => { setDraggedProject(project.id); event.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
              onDrop={(event) => { event.preventDefault(); moveProject(draggedProject, project.id); setDraggedProject(null); }}
              onDragEnd={() => setDraggedProject(null)}
              onClick={() => setProjectFilter(project.id)}
              title="Drag to reorder project"
            ><GripVertical className="project-drag-handle" /><span className="project-avatar" style={{ '--project-color': project.color }}>{initials(project.name)}</span><span><strong>{project.name}</strong><small>{board.goals.filter((goal) => goal.projectId === project.id && !['done', 'canceled'].includes(goal.status)).length} open goals</small></span></button>)}
            <button className="add-project" onClick={() => openProject()}><Plus /> Link project</button>
            {projectFilter !== 'all' && projectMap[projectFilter] && <button className="edit-project" onClick={() => openProject(projectMap[projectFilter])}><Pencil /> Project settings</button>}
          </div>
          <div className="board-controls"><div className="search-wrap"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search outcomes or criteria…" />{query && <button onClick={() => setQuery('')}><X /></button>}</div><span><Sparkles /> {visibleGoals.length} goals in view</span></div>
        </section>

        {loading ? <div className="loading-state"><Clock3 /><span>Loading the local plan…</span></div> : board.projects.length === 0 ? (
          <section className="planning-empty"><div className="empty-orbit"><Folder /></div><span className="section-kicker">Start with repository truth</span><h2>Link your first project directory</h2><p>Every goal belongs to a real folder so an agent knows exactly where to begin—without baking the implementation into the plan.</p><Button onClick={() => openProject()}><Plus /> Link project</Button></section>
        ) : (
          <section className="kanban-board" aria-label="Goal board">
            {STATES.map((state) => {
              const StateIcon = state.icon;
              const goals = visibleGoals.filter((goal) => goal.status === state.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
              return <div
                key={state.id}
                className={`kanban-column state-${state.id}`}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedGoal) {
                    const position = goalsInStatus(board.goals.filter((goal) => goal.id !== draggedGoal.id), state.id).length;
                    moveGoal(draggedGoal, state.id, position);
                  }
                  setDraggedGoal(null); setGoalDropTarget(null);
                }}
              >
                <header><span className="state-icon" style={{ '--state-color': state.color }}><StateIcon /></span><strong>{state.label}</strong><b>{counts[state.id]}</b><button onClick={() => openNewGoal(state.id)} aria-label={`Add to ${state.label}`}><Plus /></button></header>
                <div className="kanban-stack">
                  {goals.map((goal) => {
                    const project = projectMap[goal.projectId];
                    const priority = PRIORITIES.find((item) => item.id === goal.priority) ?? PRIORITIES[0];
                    const dropEdge = goalDropTarget?.id === goal.id ? goalDropTarget.edge : null;
                    return <article
                      key={goal.id}
                      className={`goal-card ${draggedGoal?.id === goal.id ? 'dragging' : ''} ${dropEdge ? `drop-${dropEdge}` : ''}`}
                      draggable
                      onDragStart={(event) => { setDraggedGoal(goal); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', goal.id); }}
                      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); const target = goalDropPosition(event, goal, state.id); setGoalDropTarget({ id: goal.id, edge: target.edge }); event.dataTransfer.dropEffect = 'move'; }}
                      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (draggedGoal) moveGoal(draggedGoal, state.id, goalDropPosition(event, goal, state.id).position); setDraggedGoal(null); setGoalDropTarget(null); }}
                      onDragEnd={() => { setDraggedGoal(null); setGoalDropTarget(null); }}
                      onClick={() => openGoal(goal)}
                    >
                      <div className="goal-card-top"><GripVertical className="drag-handle" /><span className={`priority-chip priority-${goal.priority}`} title={`Priority: ${priority.label}`}><i />{priority.label}</span><code className="goal-id" title={`Goal ID: ${goal.id}`}>#{goal.id}</code><button onClick={(event) => { event.stopPropagation(); copyBrief(goal); }} title="Copy agent brief">{copiedGoal === goal.id ? <Check /> : <Copy />}</button></div>
                      <h3>{goal.title}</h3>
                      <footer><span className="project-chip" style={{ '--project-color': project.color }}><i>{initials(project.name)}</i>{project.name}</span><time>{relativeDate(goal.updatedAt)}</time></footer>
                    </article>;
                  })}
                  {goals.length === 0 && <button className="column-empty" onClick={() => openNewGoal(state.id)}><Plus /><span>Add a goal</span></button>}
                </div>
              </div>;
            })}
          </section>
        )}
      </div>

      <Dialog open={projectDialog}>
        <DialogContent className="planning-dialog">
          <form onSubmit={submitProject}>
            <DialogHeader className="planning-dialog-header"><button type="button" className="dialog-close" onClick={() => setProjectDialog(false)}><X /></button><span className="section-kicker">Local project</span><DialogTitle>{editingProject ? 'Project settings' : 'Link a directory'}</DialogTitle><p>The path is validated on this machine and becomes the working directory in every agent brief.</p></DialogHeader>
            <DialogBody className="planning-form">
              <div className="form-grid"><Field label="Project name"><Input autoFocus required value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} placeholder="e.g. Personal Agent" /></Field><Field label="Accent color"><input className="color-input" type="color" value={projectForm.color} onChange={(event) => setProjectForm({ ...projectForm, color: event.target.value })} /></Field></div>
              <Field label="Directory on disk" hint="Choose a folder or enter an absolute path (starting with /) or a ~/ path."><div className="path-input"><Folder /><Input required value={projectForm.directory} onChange={(event) => setProjectForm({ ...projectForm, directory: event.target.value })} placeholder="~/projects/my-project" /><button type="button" className="choose-directory-button" onClick={chooseProjectDirectory} aria-label="Choose directory" title="Choose directory"><FolderOpen /></button></div></Field>
              <Field label="Project context" hint="Optional orientation only—keep individual work in goal cards."><textarea value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} placeholder="What this project exists to accomplish…" /></Field>
            </DialogBody>
            <DialogFooter className={editingProject ? 'goal-dialog-footer' : ''}>{editingProject && <Button type="button" variant="ghost" className="danger-button" onClick={unlinkProject}><Trash2 /> Unlink</Button>}{editingProject && <span />}<Button type="button" variant="ghost" onClick={() => setProjectDialog(false)}>Cancel</Button><Button disabled={saving}>{saving ? 'Validating…' : editingProject ? 'Save project' : 'Link project'} <ArrowRight /></Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={goalDialog}>
        <DialogContent className="planning-dialog goal-dialog">
          <form onSubmit={submitGoal}>
            <DialogHeader className="planning-dialog-header goal-workspace-header"><button type="button" className="dialog-close" onClick={() => setGoalDialog(false)}><X /></button><span className="section-kicker">Outcome contract</span><DialogTitle>{editingGoal ? 'Refine goal with the agent' : 'Define a goal with the agent'}</DialogTitle><p>Shape the outcome directly or work beside the read-only project investigator.</p></DialogHeader>
            <DialogBody className="goal-workspace">
              <section className="planning-form goal-form-panel">
                <div className="form-grid two"><Field label="Project"><Select value={goalForm.projectId} onChange={(event) => { setGoalForm({ ...goalForm, projectId: event.target.value }); resetAssistant(event.target.value); }}>{board.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field><Field label="Workflow state"><Select value={goalForm.status} onChange={(event) => setGoalForm({ ...goalForm, status: event.target.value })}>{STATES.map((state) => <option key={state.id} value={state.id}>{state.label}</option>)}<option value="canceled">Canceled</option></Select></Field></div>
                <Field label="Goal"><Input autoFocus required value={goalForm.title} onChange={(event) => setGoalForm({ ...goalForm, title: event.target.value })} placeholder="A concise, outcome-oriented title" /></Field>
                <Field label="Desired outcome" hint="Optional. What should be true for the user or system—not the steps to build it."><textarea value={goalForm.outcome} onChange={(event) => setGoalForm({ ...goalForm, outcome: event.target.value })} placeholder="The dashboard lets me plan work against local projects and hand a complete outcome contract to an agent." /></Field>
                <Field label="Definition of done" hint="Optional. Use observable, verifiable acceptance criteria."><textarea value={goalForm.completionCriteria} onChange={(event) => setGoalForm({ ...goalForm, completionCriteria: event.target.value })} placeholder={'• The outcome works end to end\n• Relevant tests pass\n• The visible result is verified'} /></Field>
                <Field label="Out of scope / ignore" hint="Protect the goal from scope drift. Avoid prescribing how to implement it."><textarea value={goalForm.nonGoals} onChange={(event) => setGoalForm({ ...goalForm, nonGoals: event.target.value })} placeholder="No unrelated refactors; no publishing or external changes." /></Field>
                <Field label="Priority"><Select value={goalForm.priority} onChange={(event) => setGoalForm({ ...goalForm, priority: event.target.value })}>{PRIORITIES.map((priority) => <option key={priority.id} value={priority.id}>{priority.label}</option>)}</Select></Field>
                {editingGoal && <div className="agent-brief-preview"><div><Code2 /><span><strong>Agent-ready brief</strong><small>Directory + outcome + done + scope boundary</small></span></div><Button type="button" variant="outline" size="sm" onClick={() => copyBrief(editingGoal)}><Clipboard /> {copiedGoal === editingGoal.id ? 'Copied' : 'Copy brief'}</Button></div>}
              </section>

              <aside className="goal-assistant" aria-label="Agent goal assistant">
                <header><span className="assistant-mark"><Bot /></span><div><strong>Agent</strong><small><ShieldCheck /> Read-only project access</small></div><Badge>{assistantModel.replace(/^.*\//, '')}</Badge></header>
                <div className="assistant-project"><FolderGit2 /><span><strong>{projectMap[goalForm.projectId]?.name}</strong><small>{projectMap[goalForm.projectId]?.directory}</small></span></div>
                <div className="assistant-messages" aria-live="polite">
                  {assistantMessages.map((message, index) => <div key={`${message.role}-${index}`} className={`assistant-message ${message.role}`}><span>{message.role === 'assistant' ? <Bot /> : initials('Ahmed Khattab')}</span><p>{message.content}</p></div>)}
                  {assistantLoading && <div className="assistant-message assistant thinking"><span><Bot /></span><p><i /><i /><i /></p></div>}
                  {assistantError && <div className="assistant-chat-error"><AlertCircle />{assistantError}</div>}
                  {appliedFields.length > 0 && <div className="assistant-applied"><CheckCircle2 /><span><strong>Form updated</strong><small>{appliedFields.map((field) => ({ title: 'Goal', outcome: 'Outcome', completionCriteria: 'Done', nonGoals: 'Non-goals', priority: 'Priority', status: 'State' })[field]).join(' · ')}</small></span></div>}
                  {assistantEvidence?.summary && <div className="assistant-evidence"><span><FileSearch /> Project evidence</span><p>{assistantEvidence.summary}</p>{assistantEvidence.files?.length > 0 && <div>{assistantEvidence.files.map((file) => <code key={file}>{file}</code>)}</div>}</div>}
                </div>
                {assistantMessages.length <= 1 && <div className="assistant-starters"><button type="button" onClick={() => sendGoalAssistant('Investigate this project and help me identify the most important questions needed to define this goal.')}>Investigate project</button><button type="button" onClick={() => sendGoalAssistant('Review the current draft against this project, refine it, and fill every field you can support.')}>Refine current draft</button></div>}
                <div className="assistant-composer"><textarea value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendGoalAssistant(); } }} placeholder="Describe the change, ask the agent to investigate, or say “apply this to the goal”…" /><button type="button" disabled={assistantLoading || !assistantInput.trim()} onClick={() => sendGoalAssistant()} aria-label="Send to agent"><Send /></button><small>Enter to send · Shift+Enter for a new line</small></div>
              </aside>
            </DialogBody>
            <DialogFooter className="goal-dialog-footer">{editingGoal && <Button type="button" variant="ghost" className="danger-button" onClick={() => removeGoal(editingGoal)}><Trash2 /> Delete</Button>}<span /><Button type="button" variant="ghost" onClick={() => setGoalDialog(false)}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : editingGoal ? 'Save goal' : 'Create goal'} <ArrowRight /></Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
