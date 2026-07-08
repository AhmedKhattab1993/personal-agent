import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clipboard,
  Clock,
  DatabaseZap,
  FileText,
  Gauge,
  MessageSquareText,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
} from './components/ui.jsx';
import {
  estimateOpportunity,
  filterJobsByPublishedHours,
  formatOpportunityBadge,
  formatOpportunityTitle,
  sortJobsForDisplay,
} from './opportunityScore.js';
import './styles.css';

const BRAND = {
  name: 'Upwork Dashboard',
};

const LANES = [
  {
    id: 'trading',
    label: 'Market Circuit',
    icon: TrendingUp,
    color: 'border-l-cyan-300',
    badge: 'bg-cyan-950/80 text-cyan-100 border-cyan-300/70',
  },
  {
    id: 'ai-agents',
    label: 'Upwork Circuit',
    icon: Bot,
    color: 'border-l-violet-300',
    badge: 'bg-violet-950/80 text-violet-100 border-violet-300/70',
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: DatabaseZap,
    color: 'border-l-emerald-300',
    badge: 'bg-emerald-950/80 text-emerald-100 border-emerald-300/70',
  },
];

const TIME_WINDOWS = [1, 4, 8, 24, 72];

function formatDate(value) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function jobSnippet(description) {
  if (!description) return 'No description available.';
  const normalized = description.replace(/\s+/g, ' ').trim();
  return normalized.length > 840 ? `${normalized.slice(0, 840)}...` : normalized;
}

function laneMeta(laneId) {
  return LANES.find((lane) => lane.id === laneId) ?? LANES[0];
}

function statusVariant(status) {
  if (status === 'new') return 'success';
  if (status === 'stale') return 'warning';
  return 'secondary';
}

function countLanes(records) {
  const counts = Object.fromEntries(LANES.map((lane) => [lane.id, 0]));
  for (const record of records) {
    counts[record.laneId] = (counts[record.laneId] ?? 0) + 1;
  }
  return counts;
}

function countStatuses(records) {
  const counts = { new: 0, active: 0, stale: 0 };
  for (const record of records) {
    counts[record.status] = (counts[record.status] ?? 0) + 1;
  }
  return counts;
}

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [lane, setLane] = useState('all');
  const [timeWindowHours, setTimeWindowHours] = useState('72');
  const [sortMode, setSortMode] = useState('newest');
  const [selectedJob, setSelectedJob] = useState(null);
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);
  const [coverLetterError, setCoverLetterError] = useState(null);

  async function loadJobs() {
    setError(null);
    const response = await fetch('/api/jobs');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Failed to load jobs');
    setData(payload);
  }

  async function refreshJobs() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch('/api/jobs/refresh', {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Failed to refresh jobs');
      setData(payload);
    } catch (refreshError) {
      setError(refreshError.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadSuggestedCoverLetter(job, force = false) {
    if (!job?.id || (!force && job.suggestedCoverLetter)) return;
    setCoverLetterLoading(true);
    setCoverLetterError(null);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/cover-letter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Failed to generate cover letter');

      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          jobs: (current.jobs ?? []).map((item) => (item.id === job.id ? {
            ...item,
            suggestedCoverLetter: payload.suggestedCoverLetter,
          } : item)),
        };
      });
      setSelectedJob((current) => (current?.id === job.id ? {
        ...current,
        suggestedCoverLetter: payload.suggestedCoverLetter,
      } : current));
    } catch (generationError) {
      setCoverLetterError(generationError.message);
    } finally {
      setCoverLetterLoading(false);
    }
  }

  useEffect(() => {
    loadJobs()
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') setSelectedJob(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  useEffect(() => {
    if (!selectedJob) {
      setCoverLetterError(null);
      return;
    }
    loadSuggestedCoverLetter(selectedJob).catch((generationError) => {
      setCoverLetterError(generationError.message);
    });
  }, [selectedJob?.id]);

  const jobs = data?.jobs ?? [];
  const filterReferenceTime = data?.summary?.windowEndDateTime ?? data?.summary?.generatedAt ?? new Date().toISOString();
  const timeWindowJobs = useMemo(
    () => filterJobsByPublishedHours(jobs, timeWindowHours, filterReferenceTime),
    [jobs, timeWindowHours, filterReferenceTime]
  );
  const filteredJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = timeWindowJobs.filter((job) => {
      if (lane !== 'all' && job.laneId !== lane) return false;
      if (!needle) return true;
      const haystack = [
        job.title,
        job.description,
        job.lane,
        job.piClassification?.rationale,
        job.keywordLane,
        ...(job.skills ?? []),
        ...(job.laneMatches ?? []),
        ...(job.keywordMatches ?? []),
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
    return sortJobsForDisplay(visible, sortMode);
  }, [timeWindowJobs, lane, query, sortMode]);

  const newest = timeWindowJobs[0]?.publishedDateTime ?? null;
  const laneCounts = useMemo(() => countLanes(timeWindowJobs), [timeWindowJobs]);
  const statusCounts = useMemo(() => countStatuses(timeWindowJobs), [timeWindowJobs]);
  const piClassifier = data?.summary?.piClassifier;
  const selectedOpportunity = selectedJob ? estimateOpportunity(selectedJob) : null;

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <section className="flex flex-col gap-5 rounded-lg border bg-card/95 p-5 shadow-sm shadow-black/25 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-500/35 bg-background/70 shadow-sm shadow-black/25">
              <BriefcaseBusiness className="h-8 w-8 text-slate-100" aria-hidden="true" />
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-background/60">{BRAND.name}</Badge>
                <Badge variant="secondary">Personal opportunity manager</Badge>
                <Badge variant="outline" className="bg-background/60">Upwork source</Badge>
                {piClassifier?.classifiedCount > 0 && (
                  <Badge variant="outline" className="bg-background/60">
                    PI reviewed {piClassifier.classifiedCount}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">{BRAND.name}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
                Personal dashboard for managing Upwork opportunities by lane, fit, signal, and proposal readiness.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button onClick={refreshJobs} disabled={refreshing}>
              <RefreshCcw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </Button>
          </div>
        </section>

        {error && (
          <Card className="border-red-500/30 bg-red-950/60 text-red-100">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Dashboard error</p>
                <p className="mt-1 text-sm">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          {LANES.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.id} className={`border-l-4 ${item.color}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </CardTitle>
                    <span className="text-2xl font-semibold">{laneCounts[item.id] ?? 0}</span>
                  </div>
                  <CardDescription>
                    {item.id === 'trading' && 'Trading-related jobs for Market Circuit work.'}
                    {item.id === 'ai-agents' && 'AI-related jobs, products, and video work.'}
                    {item.id === 'automation' && 'Unbranded automation work kept as its own lane.'}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_11rem_11rem_14rem]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search opportunities, signals, skills..."
                  className="pl-9"
                />
              </div>
              <Select aria-label="Lane filter" value={lane} onChange={(event) => setLane(event.target.value)}>
                <option value="all">All lanes</option>
                {LANES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </Select>
              <Select aria-label="Published window" value={timeWindowHours} onChange={(event) => setTimeWindowHours(event.target.value)}>
                {TIME_WINDOWS.map((hours) => (
                  <option key={hours} value={String(hours)}>Last {hours} {hours === 1 ? 'hour' : 'hours'}</option>
                ))}
              </Select>
              <Select aria-label="Sort jobs" value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                <option value="newest">Newest first</option>
                <option value="opportunity">Highest opportunity</option>
              </Select>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid grid-cols-3 gap-3 p-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Visible</p>
                <p className="text-xl font-semibold">{filteredJobs.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">New</p>
                <p className="text-xl font-semibold">{statusCounts.new ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Latest</p>
                <p className="text-sm font-medium">{formatDate(newest)}</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {loading ? (
          <Card>
            <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
              <RefreshCcw className="h-4 w-4 animate-spin" />
              Loading Upwork dashboard...
            </CardContent>
          </Card>
        ) : (
          <section className="grid gap-4">
            {filteredJobs.map((job) => {
              const meta = laneMeta(job.laneId);
              const opportunity = estimateOpportunity(job);
              return (
                <Card key={job.id} className={`overflow-hidden border-l-4 ${meta.color}`}>
                  <CardHeader className="gap-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge className={meta.badge}>{meta.label}</Badge>
                          <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                          {job.budget && <Badge variant="outline">{job.budget}</Badge>}
                          <Badge variant="outline" title={formatOpportunityTitle(opportunity)} className="gap-1">
                            <Gauge className="h-3 w-3" />
                            {formatOpportunityBadge(opportunity)}
                          </Badge>
                          {job.experienceLevel && <Badge variant="outline">{job.experienceLevel}</Badge>}
                        </div>
                        <CardTitle className="text-lg leading-6">{job.title}</CardTitle>
                        <CardDescription className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDate(job.publishedDateTime)}</span>
                          {job.client?.country && <span>{job.client.country}{job.client.city ? `, ${job.client.city}` : ''}</span>}
                          {job.totalApplicants !== null && <span>{job.totalApplicants} applicants</span>}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedJob(job)}>
                          <FileText className="h-4 w-4" />
                          Full description
                        </Button>
                        {job.url && (
                          <Button as="a" variant="outline" size="sm" onClick={() => window.open(job.url, '_blank', 'noopener,noreferrer')}>
                            Open
                            <ArrowUpRight className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <p className="text-sm leading-6 text-slate-200">{jobSnippet(job.description)}</p>
                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="rounded-md border bg-muted/40 p-3">
                        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          Lane signals
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(job.laneMatches ?? []).slice(0, 6).map((match) => <Badge key={match} variant="outline">{match}</Badge>)}
                        </div>
                        {job.piClassification?.rationale && (
                          <p className="mt-2 text-sm leading-5 text-slate-200">{job.piClassification.rationale}</p>
                        )}
                      </div>
                      <div className="rounded-md border bg-muted/40 p-3">
                        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <BriefcaseBusiness className="h-3.5 w-3.5" />
                          Client
                        </p>
                        <div className="grid gap-1 text-sm">
                          <span>Hires: {job.client?.hires ?? 'n/a'}</span>
                          <span>Spent: {job.client?.spent ?? 'n/a'}</span>
                          <span>Verified: {job.client?.verificationStatus ?? 'n/a'}</span>
                        </div>
                      </div>
                      <div className="rounded-md border bg-muted/40 p-3">
                        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Skills
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(job.skills ?? []).slice(0, 7).map((skill) => <Badge key={skill} variant="secondary">{skill}</Badge>)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredJobs.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No opportunities match the current filters.
                </CardContent>
              </Card>
            )}
          </section>
        )}
      </div>
      <Dialog open={Boolean(selectedJob)} onClick={() => setSelectedJob(null)}>
        {selectedJob && (
          <DialogContent onClick={(event) => event.stopPropagation()}>
            <DialogHeader>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className={laneMeta(selectedJob.laneId).badge}>{laneMeta(selectedJob.laneId).label}</Badge>
                <Badge variant={statusVariant(selectedJob.status)}>{selectedJob.status}</Badge>
                {selectedJob.budget && <Badge variant="outline">{selectedJob.budget}</Badge>}
                <Badge variant="outline" title={formatOpportunityTitle(selectedOpportunity)} className="gap-1">
                  <Gauge className="h-3 w-3" />
                  {formatOpportunityBadge(selectedOpportunity)}
                </Badge>
                {selectedJob.experienceLevel && <Badge variant="outline">{selectedJob.experienceLevel}</Badge>}
              </div>
              <DialogTitle>{selectedJob.title}</DialogTitle>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{formatDate(selectedJob.publishedDateTime)}</span>
                {selectedJob.client?.country && <span>{selectedJob.client.country}{selectedJob.client.city ? `, ${selectedJob.client.city}` : ''}</span>}
                {selectedJob.totalApplicants !== null && <span>{selectedJob.totalApplicants} applicants</span>}
              </p>
            </DialogHeader>
            <DialogBody>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {(selectedJob.laneMatches ?? []).map((match) => <Badge key={match} variant="outline">{match}</Badge>)}
              </div>
              {selectedJob.piClassification?.rationale && (
                <div className="mb-4 rounded-md border bg-muted/40 p-3 text-sm leading-6 text-slate-100">
                  <span className="font-medium">PI review: </span>
                  {selectedJob.piClassification.rationale}
                </div>
              )}
              <div className="mb-4 rounded-md border bg-muted/40 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-100">
                    <MessageSquareText className="h-4 w-4" />
                    Proposal draft
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedJob.suggestedCoverLetter?.text && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigator.clipboard?.writeText(selectedJob.suggestedCoverLetter.text)}
                      >
                        <Clipboard className="h-4 w-4" />
                        Copy
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={coverLetterLoading}
                      onClick={() => loadSuggestedCoverLetter(selectedJob, true)}
                    >
                      <RefreshCcw className={coverLetterLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                      Regenerate
                    </Button>
                  </div>
                </div>
                {coverLetterLoading && !selectedJob.suggestedCoverLetter?.text && (
                  <p className="text-sm text-muted-foreground">Generating with PI...</p>
                )}
                {coverLetterError && (
                  <p className="text-sm leading-6 text-red-200">{coverLetterError}</p>
                )}
                {selectedJob.suggestedCoverLetter?.text && (
                  <>
                    <div className="whitespace-pre-wrap text-sm leading-7 text-slate-100">
                      {selectedJob.suggestedCoverLetter.text}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {selectedJob.suggestedCoverLetter.model} - {formatDate(selectedJob.suggestedCoverLetter.generatedAt)}
                    </p>
                  </>
                )}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-7 text-slate-100">
                {selectedJob.description || 'No description available.'}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedJob(null)}>Close</Button>
              {selectedJob.url && (
                <Button onClick={() => window.open(selectedJob.url, '_blank', 'noopener,noreferrer')}>
                  Open on Upwork
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </main>
  );
}

const rootElement = document.getElementById('root');
window.__upworkDashboardRoot ??= createRoot(rootElement);
window.__upworkDashboardRoot.render(<App />);
