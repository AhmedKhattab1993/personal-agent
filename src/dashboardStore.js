import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { classifyLane, LANES } from './positioningLanes.js';
import { fetchLatestSoftwareJobs, parseLimit } from './upworkJobs.js';

const CACHE_PATH = resolve('data/dashboard-lane-jobs.json');
const SEED_JOBS_PATH = resolve('data/latest-software-dev-1000.jsonl');
const DEFAULT_REFRESH_LIMIT = 200;
const EXCLUDED_CLIENT_COUNTRIES = new Set([
  'india',
  'ind',
  'pakistan',
  'pak',
  'nigeria',
  'nga',
]);

function parseJsonl(content) {
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function moneyDisplay(value) {
  return value?.displayValue && value.displayValue !== '0.0' ? value.displayValue : null;
}

function jobUrl(job) {
  return job.ciphertext ? `https://www.upwork.com/jobs/${job.ciphertext}` : null;
}

function normalizeCountry(country) {
  return String(country ?? '').trim().toLowerCase();
}

function isExcludedCountry(country) {
  return EXCLUDED_CLIENT_COUNTRIES.has(normalizeCountry(country));
}

function isExcludedRawJob(job) {
  return isExcludedCountry(job.client?.location?.country);
}

function isExcludedCompactJob(job) {
  return isExcludedCountry(job.client?.country);
}

function compactJob(job, laneInfo, existing = null, now = new Date().toISOString()) {
  const client = job.client ?? {};
  const location = client.location ?? {};
  const fixedBudget = moneyDisplay(job.amount);
  const hourlyMin = moneyDisplay(job.hourlyBudgetMin);
  const hourlyMax = moneyDisplay(job.hourlyBudgetMax);
  const budget = fixedBudget ?? (hourlyMin || hourlyMax ? `${hourlyMin ?? '?'} - ${hourlyMax ?? '?'}/hr` : null);

  return {
    id: job.id,
    ciphertext: job.ciphertext ?? null,
    url: jobUrl(job),
    title: job.title ?? '',
    description: job.description ?? '',
    lane: laneInfo.laneLabel,
    laneId: laneInfo.laneId,
    laneMatches: laneInfo.matches,
    matchedLanes: laneInfo.matchedLanes,
    publishedDateTime: job.publishedDateTime ?? null,
    createdDateTime: job.createdDateTime ?? null,
    durationLabel: job.durationLabel ?? null,
    engagement: job.engagement ?? null,
    experienceLevel: job.experienceLevel ?? null,
    totalApplicants: job.totalApplicants ?? null,
    budget,
    skills: (job.skills ?? []).map((skill) => skill.prettyName ?? skill.name).filter(Boolean).slice(0, 10),
    client: {
      hires: client.totalHires ?? null,
      postedJobs: client.totalPostedJobs ?? null,
      spent: client.totalSpent?.displayValue ?? null,
      verificationStatus: client.verificationStatus ?? null,
      feedback: client.totalFeedback ?? null,
      reviews: client.totalReviews ?? null,
      country: location.country ?? null,
      city: location.city ?? null,
    },
    status: existing ? 'active' : 'new',
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    seenCount: (existing?.seenCount ?? 0) + 1,
  };
}

function summarize(records, source, fetchedCount = null) {
  const laneCounts = Object.fromEntries(LANES.map((lane) => [lane.label, 0]));
  const statusCounts = { new: 0, active: 0, stale: 0 };
  for (const record of records) {
    laneCounts[record.lane] = (laneCounts[record.lane] ?? 0) + 1;
    statusCounts[record.status] = (statusCounts[record.status] ?? 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    source,
    fetchedCount,
    relevantCount: records.length,
    excludedClientCountries: ['India', 'Pakistan', 'Nigeria'],
    laneCounts,
    statusCounts,
  };
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const dateDiff = new Date(b.publishedDateTime ?? b.lastSeenAt) - new Date(a.publishedDateTime ?? a.lastSeenAt);
    if (dateDiff !== 0) return dateDiff;
    return a.title.localeCompare(b.title);
  });
}

async function seedFromLatestFile() {
  if (!existsSync(SEED_JOBS_PATH)) {
    return {
      jobs: [],
      summary: summarize([], 'empty'),
    };
  }
  const rawJobs = parseJsonl(await readFile(SEED_JOBS_PATH, 'utf8'));
  const now = new Date().toISOString();
  const jobs = rawJobs
    .filter((job) => !isExcludedRawJob(job))
    .map((job) => ({ job, laneInfo: classifyLane(job) }))
    .filter((item) => item.laneInfo.relevant)
    .map((item) => compactJob(item.job, item.laneInfo, null, now));
  const sorted = sortRecords(jobs);
  return {
    jobs: sorted,
    summary: summarize(sorted, 'seed:data/latest-software-dev-1000.jsonl', rawJobs.length),
  };
}

function normalizeDashboardState(state) {
  const jobs = sortRecords((state.jobs ?? []).filter((job) => !isExcludedCompactJob(job)));
  return {
    ...state,
    jobs,
    summary: summarize(jobs, state.summary?.source ?? 'cache', state.summary?.fetchedCount ?? null),
  };
}

export async function loadDashboardJobs() {
  const cached = await readJson(CACHE_PATH, null);
  if (cached) {
    const normalized = normalizeDashboardState(cached);
    if ((normalized.jobs ?? []).length !== (cached.jobs ?? []).length) {
      await writeJson(CACHE_PATH, normalized);
    }
    return normalized;
  }

  const seeded = await seedFromLatestFile();
  await writeJson(CACHE_PATH, seeded);
  return seeded;
}

export async function refreshDashboardJobs(limitValue = DEFAULT_REFRESH_LIMIT) {
  const limit = parseLimit(limitValue, DEFAULT_REFRESH_LIMIT);
  const existingState = await loadDashboardJobs();
  const existingById = new Map((existingState.jobs ?? []).map((job) => [job.id, job]));
  const now = new Date().toISOString();

  const latest = await fetchLatestSoftwareJobs(limit);
  const refreshed = latest.jobs
    .filter((job) => !isExcludedRawJob(job))
    .map((job) => ({ job, laneInfo: classifyLane(job) }))
    .filter((item) => item.laneInfo.relevant)
    .map((item) => compactJob(item.job, item.laneInfo, existingById.get(item.job.id), now));

  const refreshedIds = new Set(refreshed.map((job) => job.id));
  const stale = (existingState.jobs ?? [])
    .filter((job) => !refreshedIds.has(job.id))
    .map((job) => ({ ...job, status: 'stale' }));

  const jobs = sortRecords([...refreshed, ...stale]);
  const state = {
    jobs,
    summary: summarize(jobs, 'upwork.graphql.marketplaceJobPostingsSearch', latest.jobs.length),
    upworkSummary: latest.summary,
  };
  await writeJson(CACHE_PATH, state);
  return state;
}
