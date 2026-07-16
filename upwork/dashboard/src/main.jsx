import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertCircle, ArrowRight, ArrowUpRight, Bot, BriefcaseBusiness,
  ChevronRight, CircleDollarSign, Clipboard, Clock3, DatabaseZap, FileText,
  Columns3, Gauge, LayoutDashboard, MapPin, MessageSquareText, RefreshCcw, Search,
  ShieldCheck, SlidersHorizontal, Sparkles, TrendingUp, Users, X,
} from 'lucide-react';

import {
  Badge, Button, Dialog, DialogBody, DialogContent,
  DialogFooter, DialogHeader, DialogTitle, Input, Select,
} from './components/ui.jsx';
import {
  estimateOpportunity, filterJobsByPublishedHours, formatOpportunityBadge,
  formatOpportunityTitle, sortJobsForDisplay,
} from './opportunityScore.js';
import PlanningBoard from './planningBoard.jsx';
import './styles.css';

const LANES = [
  { id: 'trading', label: 'Market Circuit', icon: TrendingUp, accent: 'cyan', description: 'Trading systems & market intelligence' },
  { id: 'ai-agents', label: 'Work Circuit', icon: Bot, accent: 'violet', description: 'Agents, RAG & AI products' },
  { id: 'automation', label: 'Automation', icon: DatabaseZap, accent: 'amber', description: 'Systems & workflow operations' },
];
const TIME_WINDOWS = [1, 4, 8, 24, 72];

function formatDate(value) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function timeAgo(value, nowValue) {
  const delta = Math.max(0, new Date(nowValue).getTime() - new Date(value).getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function jobSnippet(description) {
  if (!description) return 'No description available.';
  const normalized = description.replace(/\s+/g, ' ').trim();
  return normalized.length > 310 ? `${normalized.slice(0, 310)}…` : normalized;
}

function laneMeta(laneId) { return LANES.find((item) => item.id === laneId) ?? LANES[0]; }
function countLanes(records) {
  const counts = Object.fromEntries(LANES.map((item) => [item.id, 0]));
  records.forEach((record) => { counts[record.laneId] = (counts[record.laneId] ?? 0) + 1; });
  return counts;
}

function scoreTone(estimate) {
  if (!estimate?.rankable) return 'muted';
  if (estimate.score >= 35) return 'high';
  if (estimate.score >= 15) return 'medium';
  return 'low';
}

function DashboardNav({ active, onChange }) {
  return <nav className="dashboard-tabs" aria-label="Dashboard views">
    <button className={active === 'planning' ? 'active' : ''} onClick={() => onChange('planning')}><Columns3 /> Projects</button>
    <button className={active === 'upwork' ? 'active' : ''} onClick={() => onChange('upwork')}><BriefcaseBusiness /> Upwork</button>
  </nav>;
}

function UpworkDashboard({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [lane, setLane] = useState('all');
  const [timeWindowHours, setTimeWindowHours] = useState('72');
  const [sortMode, setSortMode] = useState('opportunity');
  const [selectedJob, setSelectedJob] = useState(null);
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);
  const [coverLetterError, setCoverLetterError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function loadJobs() {
    setError(null);
    const response = await fetch('/api/jobs');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Failed to load jobs');
    setData(payload);
  }

  async function refreshJobs() {
    setRefreshing(true); setError(null);
    try {
      const response = await fetch('/api/jobs/refresh', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Failed to refresh jobs');
      setData(payload);
    } catch (refreshError) { setError(refreshError.message); }
    finally { setRefreshing(false); }
  }

  async function loadSuggestedCoverLetter(job, force = false) {
    if (!job?.id || (!force && job.suggestedCoverLetter)) return;
    setCoverLetterLoading(true); setCoverLetterError(null);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/cover-letter`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Failed to generate cover letter');
      setData((current) => current && ({ ...current, jobs: (current.jobs ?? []).map((item) => item.id === job.id ? { ...item, suggestedCoverLetter: payload.suggestedCoverLetter } : item) }));
      setSelectedJob((current) => current?.id === job.id ? { ...current, suggestedCoverLetter: payload.suggestedCoverLetter } : current);
    } catch (generationError) { setCoverLetterError(generationError.message); }
    finally { setCoverLetterLoading(false); }
  }

  useEffect(() => { loadJobs().catch((err) => setError(err.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    const close = (event) => event.key === 'Escape' && setSelectedJob(null);
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, []);
  useEffect(() => {
    setCopied(false); setCoverLetterError(null);
    if (selectedJob) loadSuggestedCoverLetter(selectedJob).catch((err) => setCoverLetterError(err.message));
  }, [selectedJob?.id]);

  const jobs = data?.jobs ?? [];
  const referenceTime = data?.summary?.windowEndDateTime ?? data?.summary?.generatedAt ?? new Date().toISOString();
  const timeWindowJobs = useMemo(() => filterJobsByPublishedHours(jobs, timeWindowHours, referenceTime), [jobs, timeWindowHours, referenceTime]);
  const filteredJobs = useMemo(() => sortJobsForDisplay(timeWindowJobs.filter((job) => {
    if (lane !== 'all' && job.laneId !== lane) return false;
    if (!query.trim()) return true;
    const haystack = [job.title, job.description, job.lane, job.piClassification?.rationale, ...(job.skills ?? []), ...(job.laneMatches ?? [])].join(' ').toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), sortMode), [timeWindowJobs, lane, query, sortMode]);

  const laneCounts = useMemo(() => countLanes(timeWindowJobs), [timeWindowJobs]);
  const newCount = timeWindowJobs.filter((job) => job.status === 'new').length;
  const rankable = timeWindowJobs.map(estimateOpportunity).filter((estimate) => estimate.rankable);
  const highFitCount = rankable.filter((estimate) => estimate.score >= 35).length;
  const selectedOpportunity = selectedJob ? estimateOpportunity(selectedJob) : null;
  const activeFilterCount = Number(lane !== 'all') + Number(timeWindowHours !== '72') + Number(sortMode !== 'opportunity') + Number(Boolean(query));

  return (
    <main className="app-shell">
      <div className="ambient-field" aria-hidden="true" />
      <div className="dashboard-wrap">
        <header className="topbar">
          <div className="brand-lockup">
            <span className="brand-mark"><LayoutDashboard /></span>
            <div><span className="eyebrow">Personal command center</span><strong>Agent Dashboard</strong></div>
          </div>
          {navigation}
          <div className="topbar-actions">
            <span className="live-status"><i /> Live feed</span>
            <span className="last-sync">Updated {timeAgo(referenceTime, new Date().toISOString())}</span>
            <Button className="refresh-button" onClick={refreshJobs} disabled={refreshing}>
              <RefreshCcw className={refreshing ? 'animate-spin' : ''} />
              <span>{refreshing ? 'Scanning…' : 'Scan now'}</span>
            </Button>
          </div>
        </header>

        <section className="hero-panel">
          <div className="hero-copy">
            <Badge className="signal-badge"><Sparkles /> Personal opportunity radar</Badge>
            <h1>Find the work worth <em>winning.</em></h1>
            <p>One focused view of every relevant Upwork signal—ranked by value, recency, and fit for your three business lanes.</p>
          </div>
          <div className="hero-stats">
            <div><span>In radar</span><strong>{timeWindowJobs.length}</strong><small>last {timeWindowHours}h</small></div>
            <div><span>High value</span><strong>{highFitCount}</strong><small>$35+/hr equivalent</small></div>
            <div><span>New signals</span><strong>{newCount}</strong><small>unreviewed jobs</small></div>
          </div>
        </section>

        {error && <div className="error-strip"><AlertCircle /><div><strong>Radar interrupted</strong><span>{error}</span></div></div>}

        <section className="lane-grid" aria-label="Opportunity lanes">
          {LANES.map((item) => {
            const Icon = item.icon; const active = lane === item.id;
            return (
              <button key={item.id} className={`lane-card lane-${item.accent} ${active ? 'active' : ''}`} onClick={() => setLane(active ? 'all' : item.id)}>
                <span className="lane-icon"><Icon /></span>
                <span className="lane-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                <span className="lane-count">{laneCounts[item.id] ?? 0}</span>
                <ChevronRight className="lane-arrow" />
              </button>
            );
          })}
        </section>

        <section className="command-bar">
          <div className="search-wrap"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, skill, client signal…" />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X /></button>}</div>
          <div className="filter-group">
            <div className="time-pills" aria-label="Published window">
              {TIME_WINDOWS.map((hours) => <button key={hours} className={timeWindowHours === String(hours) ? 'active' : ''} onClick={() => setTimeWindowHours(String(hours))}>{hours}h</button>)}
            </div>
            <Select aria-label="Sort opportunities" value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
              <option value="opportunity">Best opportunity</option><option value="newest">Most recent</option>
            </Select>
            {activeFilterCount > 0 && <button className="clear-filters" onClick={() => { setQuery(''); setLane('all'); setTimeWindowHours('72'); setSortMode('opportunity'); }}>Reset {activeFilterCount}</button>}
          </div>
        </section>

        <div className="results-heading">
          <div><span className="section-kicker">Ranked pipeline</span><h2>{lane === 'all' ? 'All opportunities' : laneMeta(lane).label}</h2></div>
          <span><strong>{filteredJobs.length}</strong> matches</span>
        </div>

        {loading ? <div className="loading-state"><RefreshCcw className="animate-spin" /><span>Calibrating opportunity radar…</span></div> : (
          <section className="opportunity-list">
            {filteredJobs.map((job, index) => {
              const meta = laneMeta(job.laneId); const opportunity = estimateOpportunity(job); const tone = scoreTone(opportunity);
              return (
                <article key={job.id} className={`opportunity-card accent-${meta.accent}`}>
                  <div className="rank-column"><span>#{String(index + 1).padStart(2, '0')}</span><i /></div>
                  <div className="job-main">
                    <div className="job-labels"><Badge className={`lane-badge ${meta.accent}`}>{meta.label}</Badge>{job.status === 'new' && <Badge className="new-badge">New</Badge>}<span className="published"><Clock3 /> {timeAgo(job.publishedDateTime, referenceTime)}</span></div>
                    <h3>{job.title}</h3>
                    <p className="job-description">{jobSnippet(job.description)}</p>
                    <div className="job-footer">
                      <div className="skill-list">{(job.skills ?? []).slice(0, 4).map((skill) => <span key={skill}>{skill}</span>)}{(job.skills?.length ?? 0) > 4 && <span>+{job.skills.length - 4}</span>}</div>
                      <button className="details-link" onClick={() => setSelectedJob(job)}>Review opportunity <ArrowRight /></button>
                    </div>
                  </div>
                  <aside className="job-metrics">
                    <div className={`score-box score-${tone}`} title={formatOpportunityTitle(opportunity)}><span>Value signal</span><strong>{opportunity.rankable ? `$${opportunity.score.toFixed(opportunity.score >= 100 ? 0 : 1)}` : '—'}</strong><small>{opportunity.rankable ? '/ hr equivalent' : 'Budget unrated'}</small></div>
                    <dl>
                      <div><dt><CircleDollarSign /> Budget</dt><dd>{job.budget || 'Not stated'}</dd></div>
                      <div><dt><Users /> Applicants</dt><dd>{job.totalApplicants ?? '—'}</dd></div>
                      <div><dt><MapPin /> Client</dt><dd>{job.client?.country || 'Unknown'}</dd></div>
                      <div><dt><ShieldCheck /> Verified</dt><dd>{job.client?.verificationStatus === 'VERIFIED' ? 'Yes' : 'No'}</dd></div>
                    </dl>
                    {job.url && <button className="external-link" onClick={() => window.open(job.url, '_blank', 'noopener,noreferrer')} aria-label="Open on Upwork"><ArrowUpRight /></button>}
                  </aside>
                </article>
              );
            })}
            {filteredJobs.length === 0 && <div className="empty-state"><SlidersHorizontal /><h3>No signals in this view</h3><p>Try a wider time window or reset the active filters.</p><Button variant="outline" onClick={() => { setQuery(''); setLane('all'); setTimeWindowHours('72'); }}>Reset filters</Button></div>}
          </section>
        )}
      </div>

      <Dialog open={Boolean(selectedJob)} onClick={() => setSelectedJob(null)}>
        {selectedJob && <DialogContent className="job-dialog" onClick={(event) => event.stopPropagation()}>
          <DialogHeader className="dialog-heading">
            <button className="dialog-close" onClick={() => setSelectedJob(null)} aria-label="Close"><X /></button>
            <div className="job-labels"><Badge className={`lane-badge ${laneMeta(selectedJob.laneId).accent}`}>{laneMeta(selectedJob.laneId).label}</Badge><span className="published"><Clock3 /> {formatDate(selectedJob.publishedDateTime)}</span></div>
            <DialogTitle>{selectedJob.title}</DialogTitle>
            <div className="dialog-summary"><span><CircleDollarSign /> {selectedJob.budget || 'Budget not stated'}</span><span><Users /> {selectedJob.totalApplicants ?? '—'} applicants</span><span><MapPin /> {selectedJob.client?.country || 'Unknown location'}</span><Badge className={`score-chip score-${scoreTone(selectedOpportunity)}`}><Gauge /> {formatOpportunityBadge(selectedOpportunity)}</Badge></div>
          </DialogHeader>
          <DialogBody className="dialog-body">
            {selectedJob.piClassification?.rationale && <div className="pi-insight"><span><Sparkles /> Agent signal</span><p>{selectedJob.piClassification.rationale}</p></div>}
            <section className="proposal-panel">
              <div className="proposal-header"><div><span className="section-kicker">Ready to personalize</span><h3><MessageSquareText /> Proposal draft</h3></div><div>
                {selectedJob.suggestedCoverLetter?.text && <Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard?.writeText(selectedJob.suggestedCoverLetter.text); setCopied(true); }}><Clipboard /> {copied ? 'Copied' : 'Copy'}</Button>}
                <Button variant="outline" size="sm" disabled={coverLetterLoading} onClick={() => loadSuggestedCoverLetter(selectedJob, true)}><RefreshCcw className={coverLetterLoading ? 'animate-spin' : ''} /> Regenerate</Button>
              </div></div>
              {coverLetterLoading && !selectedJob.suggestedCoverLetter?.text && <p className="muted-copy">Agent is drafting your response…</p>}
              {coverLetterError && <p className="proposal-error">{coverLetterError}</p>}
              {selectedJob.suggestedCoverLetter?.text && <div className="proposal-copy">{selectedJob.suggestedCoverLetter.text}</div>}
            </section>
            <section className="description-panel"><span className="section-kicker">Full brief</span><h3><FileText /> Job description</h3><div>{selectedJob.description || 'No description available.'}</div></section>
          </DialogBody>
          <DialogFooter><Button variant="ghost" onClick={() => setSelectedJob(null)}>Close</Button>{selectedJob.url && <Button onClick={() => window.open(selectedJob.url, '_blank', 'noopener,noreferrer')}>Open on Upwork <ArrowUpRight /></Button>}</DialogFooter>
        </DialogContent>}
      </Dialog>
    </main>
  );
}

function App() {
  const initialView = window.location.hash === '#upwork' ? 'upwork' : 'planning';
  const [activeView, setActiveView] = useState(initialView);
  function navigate(view) {
    setActiveView(view);
    window.history.replaceState(null, '', view === 'planning' ? '#projects' : '#upwork');
  }
  const navigation = <DashboardNav active={activeView} onChange={navigate} />;
  return activeView === 'planning'
    ? <PlanningBoard navigation={navigation} />
    : <UpworkDashboard navigation={navigation} />;
}

const rootElement = document.getElementById('root');
window.__upworkDashboardRoot ??= createRoot(rootElement);
window.__upworkDashboardRoot.render(<App />);
