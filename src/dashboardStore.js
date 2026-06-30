import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { generateCoverLetterWithPi } from './piCoverLetter.js';
import { classifyLaneCandidatesWithPi } from './piLaneClassifier.js';
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
  const budget = fixedBudget ?? (hourlyMin || hourlyMax ? `${hourlyMin ?? '?'} - ${hourlyMax ?? '?'}/hr` : null) ?? existing?.budget ?? null;

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
    keywordLaneId: laneInfo.keywordLaneId ?? laneInfo.laneId,
    keywordLane: laneInfo.keywordLaneLabel ?? laneInfo.laneLabel,
    keywordMatches: laneInfo.keywordMatches ?? laneInfo.matches,
    piClassification: laneInfo.piClassification ?? null,
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
    suggestedCoverLetter: existing?.suggestedCoverLetter ?? null,
  };
}

function summarize(records, source, fetchedCount = null) {
  const laneCounts = Object.fromEntries(LANES.map((lane) => [lane.label, 0]));
  const statusCounts = { new: 0, active: 0, stale: 0 };
  let piClassifiedCount = 0;
  for (const record of records) {
    laneCounts[record.lane] = (laneCounts[record.lane] ?? 0) + 1;
    statusCounts[record.status] = (statusCounts[record.status] ?? 0) + 1;
    if (record.piClassification) piClassifiedCount += 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    source,
    fetchedCount,
    relevantCount: records.length,
    excludedClientCountries: ['India', 'Pakistan', 'Nigeria'],
    piClassifier: {
      model: records.find((record) => record.piClassification)?.piClassification?.model ?? process.env.PI_LANE_MODEL ?? 'zai/glm-5.2',
      classifiedCount: piClassifiedCount,
    },
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

async function classifyRelevantJobs(rawJobs) {
  const keywordCandidates = rawJobs
    .filter((job) => !isExcludedRawJob(job))
    .map((job) => ({ job, laneInfo: classifyLane(job) }))
    .filter((item) => item.laneInfo.relevant);

  const adjudicated = await classifyLaneCandidatesWithPi(keywordCandidates);
  return adjudicated.filter((item) => item.laneInfo.relevant);
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
  const classified = await classifyRelevantJobs(rawJobs);
  const jobs = classified
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
  const classified = await classifyRelevantJobs(latest.jobs);
  const refreshed = classified
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

export async function suggestCoverLetterForJob(jobId, options = {}) {
  const state = await loadDashboardJobs();
  const jobs = state.jobs ?? [];
  const index = jobs.findIndex((job) => String(job.id) === String(jobId));
  if (index === -1) {
    throw new Error(`dashboard job not found: ${jobId}`);
  }

  const job = jobs[index];
  if (job.suggestedCoverLetter && !options.force) {
    return {
      jobId: job.id,
      suggestedCoverLetter: job.suggestedCoverLetter,
    };
  }

  const suggestedCoverLetter = await generateCoverLetterWithPi(job);
  const updatedJob = {
    ...job,
    suggestedCoverLetter,
  };
  const updatedJobs = [...jobs];
  updatedJobs[index] = updatedJob;
  const updatedState = {
    ...state,
    jobs: updatedJobs,
    summary: summarize(updatedJobs, state.summary?.source ?? 'cache', state.summary?.fetchedCount ?? null),
  };
  await writeJson(CACHE_PATH, updatedState);
  return {
    jobId: job.id,
    suggestedCoverLetter,
    job: updatedJob,
  };
}

function compactJobToRawJob(job) {
  return {
    ...job,
    amount: null,
    hourlyBudgetMin: null,
    hourlyBudgetMax: null,
    client: {
      totalHires: job.client?.hires ?? null,
      totalPostedJobs: job.client?.postedJobs ?? null,
      totalSpent: job.client?.spent ? { displayValue: job.client.spent } : null,
      verificationStatus: job.client?.verificationStatus ?? null,
      totalFeedback: job.client?.feedback ?? null,
      totalReviews: job.client?.reviews ?? null,
      location: {
        country: job.client?.country ?? null,
        city: job.client?.city ?? null,
      },
    },
    skills: (job.skills ?? []).map((skill) => ({ name: skill, prettyName: skill })),
  };
}

export async function reclassifyDashboardJobs() {
  const existingState = await loadDashboardJobs();
  const now = new Date().toISOString();
  const rawJobs = (existingState.jobs ?? []).map(compactJobToRawJob);
  const classified = await classifyRelevantJobs(rawJobs);
  const existingById = new Map((existingState.jobs ?? []).map((job) => [job.id, job]));
  const jobs = sortRecords(classified.map((item) => {
    const existing = existingById.get(item.job.id);
    const record = compactJob(item.job, item.laneInfo, existing, now);
    return {
      ...record,
      status: existing?.status ?? record.status,
      firstSeenAt: existing?.firstSeenAt ?? record.firstSeenAt,
      lastSeenAt: existing?.lastSeenAt ?? record.lastSeenAt,
      seenCount: existing?.seenCount ?? record.seenCount,
    };
  }));
  const state = {
    ...existingState,
    jobs,
    summary: summarize(jobs, 'cache:pi-reclassified', existingState.summary?.fetchedCount ?? null),
  };
  await writeJson(CACHE_PATH, state);
  return state;
}
