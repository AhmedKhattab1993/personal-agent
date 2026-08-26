import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureProposalTemplate, generateCoverLetterWithPi } from './coverLetter.js';
import { applyPiLaneDecision, classifyLaneCandidatesWithPi } from './laneClassifier.js';
import { classifyLane, LANES } from './positioningLanes.js';
import { fetchRecentPositioningJobs, findJobByTitle, POSITIONING_SEARCH_SOURCE } from './jobs.js';
import { DEFAULT_PI_MODEL } from '../piCli.js';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DATA_ROOT = join(APP_ROOT, 'data');
const CACHE_PATH = join(DATA_ROOT, 'upwork-jobs.json');
const DEFAULT_LOOKBACK_HOURS = 72;
export const JOB_CLASSIFICATIONS = Object.freeze({
  APPLIED: 'applied',
  NOT_INTERESTED: 'not_interested',
});
const VALID_JOB_CLASSIFICATIONS = new Set(Object.values(JOB_CLASSIFICATIONS));
const EXCLUDED_CLIENT_COUNTRIES = new Set([
  'india',
  'ind',
  'pakistan',
  'pak',
  'nigeria',
  'nga',
]);
// Source-stated fixed budgets below this amount are not worth pursuing.
// Hourly ranges and estimates never trigger the exclusion.
const MIN_FIXED_BUDGET = 300;

async function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

function moneyDisplay(value) {
  return value?.displayValue && value.displayValue !== '0.0' ? value.displayValue : null;
}

export function upworkApplyUrl(ciphertext) {
  return ciphertext ? `https://www.upwork.com/ab/proposals/job/${ciphertext}/apply/` : null;
}

function jobUrl(job) {
  return upworkApplyUrl(job.ciphertext);
}

function normalizeCountry(country) {
  return String(country ?? '').trim().toLowerCase();
}

function isExcludedCountry(country) {
  return EXCLUDED_CLIENT_COUNTRIES.has(normalizeCountry(country));
}

const HOURLY_BUDGET_PATTERN = /\/\s*hr\b|per\s+hour|hourly/i;

/** Source-stated fixed budget from a raw Upwork posting, or null. */
function rawFixedBudgetValue(amount) {
  if (!moneyDisplay(amount)) return null;
  const value = Number(amount.rawValue);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Source-stated fixed budget from a compact cached job's budget string, or null. */
function compactFixedBudgetValue(budget) {
  const text = String(budget ?? '').trim();
  if (!text || HOURLY_BUDGET_PATTERN.test(text)) return null;
  const value = Number(text.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isBelowMinFixedBudget(fixedBudget) {
  return fixedBudget !== null && fixedBudget < MIN_FIXED_BUDGET;
}

export function isExcludedRawJob(job) {
  return isExcludedCountry(job.client?.location?.country)
    || isBelowMinFixedBudget(rawFixedBudgetValue(job.amount));
}

export function isExcludedCompactJob(job) {
  return isExcludedCountry(job.client?.country)
    || isBelowMinFixedBudget(compactFixedBudgetValue(job.budget));
}

function lookbackCutoffDate(now = new Date()) {
  return new Date(now.getTime() - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);
}

function validDate(value) {
  const date = new Date(value ?? 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinLookback(job, cutoff) {
  const published = validDate(job.publishedDateTime);
  return published ? published > cutoff : false;
}

export function normalizeJobClassification(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!VALID_JOB_CLASSIFICATIONS.has(value)) {
    throw new Error(`classification must be one of ${[...VALID_JOB_CLASSIFICATIONS].join(', ')}, got ${value}`);
  }
  return value;
}

function shouldRetainJob(job, cutoff) {
  return normalizeJobClassification(job.classification) !== null || isWithinLookback(job, cutoff);
}

export function mergeApplicantCount(freshRaw, storedRaw) {
  const fresh = Number.isInteger(freshRaw) && freshRaw > 0 ? freshRaw : 0;
  const stored = Number.isInteger(storedRaw) && storedRaw > 0 ? storedRaw : 0;
  return fresh > 0 || stored > 0 ? Math.max(fresh, stored) : null;
}

export function compactJob(job, laneInfo, existing = null, now = new Date().toISOString()) {
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
    // Upwork's search API intermittently reports 0 for postings whose
    // applicant count has not materialized yet (observed: 0 at one fetch,
    // 14 at the next, then 0 again — inconsistent API replicas). Treat 0 as
    // "not yet reported" and keep the last materialized count once known,
    // since applicant counts only grow.
    // Applicant counts only grow, and Upwork replicas intermittently serve a
    // stale zero while a posting's count materializes.
    totalApplicants: mergeApplicantCount(job.totalApplicants, existing?.totalApplicants),
    budget,
    skills: (job.skills ?? []).map((skill) => skill.prettyName ?? skill.name).filter(Boolean).slice(0, 10),
    client: {
      name: client.name ?? client.firstName ?? client.contactName ?? existing?.client?.name ?? null,
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
    classification: normalizeJobClassification(existing?.classification),
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    seenCount: (existing?.seenCount ?? 0) + 1,
    suggestedCoverLetter: normalizeSuggestedCoverLetter(existing?.suggestedCoverLetter, existing),
  };
}

function normalizeSuggestedCoverLetter(suggestedCoverLetter, job = null) {
  if (!suggestedCoverLetter?.text) return suggestedCoverLetter ?? null;
  return {
    ...suggestedCoverLetter,
    text: ensureProposalTemplate(suggestedCoverLetter.text, job),
  };
}

function summarize(records, source, fetchedCount = null, extras = {}) {
  const laneCounts = Object.fromEntries(LANES.map((lane) => [lane.label, 0]));
  const statusCounts = { new: 0, active: 0, stale: 0 };
  const classificationCounts = { open: 0, applied: 0, not_interested: 0 };
  let piClassifiedCount = 0;
  for (const record of records) {
    laneCounts[record.lane] = (laneCounts[record.lane] ?? 0) + 1;
    statusCounts[record.status] = (statusCounts[record.status] ?? 0) + 1;
    const classification = normalizeJobClassification(record.classification);
    classificationCounts[classification ?? 'open'] += 1;
    if (record.piClassification) piClassifiedCount += 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    source,
    fetchedCount,
    lookbackHours: DEFAULT_LOOKBACK_HOURS,
    relevantCount: records.length,
    excludedClientCountries: ['India', 'Pakistan', 'Nigeria'],
    excludedBelowFixedBudget: MIN_FIXED_BUDGET,
    piClassifier: {
      model: records.find((record) => record.piClassification)?.piClassification?.model ?? process.env.PI_LANE_MODEL ?? DEFAULT_PI_MODEL,
      classifiedCount: piClassifiedCount,
    },
    laneCounts,
    statusCounts,
    classificationCounts,
    ...extras,
  };
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const dateDiff = new Date(b.publishedDateTime ?? b.lastSeenAt) - new Date(a.publishedDateTime ?? a.lastSeenAt);
    if (dateDiff !== 0) return dateDiff;
    return a.title.localeCompare(b.title);
  });
}

async function classifyRelevantJobs(rawJobs, existingById = new Map()) {
  const keywordCandidates = rawJobs
    .filter((job) => !isExcludedRawJob(job))
    .map((job) => ({ job, laneInfo: classifyLane(job) }))
    .filter((item) => item.laneInfo.relevant);

  // Reuse stored PI decisions for already-classified jobs so window-wide
  // re-polls only cost classifier runs for genuinely new postings.
  const reused = [];
  const fresh = [];
  for (const item of keywordCandidates) {
    const stored = existingById.get(String(item.job.id))?.piClassification;
    if (stored) {
      reused.push({ job: item.job, laneInfo: applyPiLaneDecision(item.laneInfo, stored) });
    } else {
      fresh.push(item);
    }
  }

  const adjudicated = await classifyLaneCandidatesWithPi(fresh);
  return [...reused, ...adjudicated].filter((item) => item.laneInfo.relevant);
}

function normalizeUpworkState(state) {
  const now = new Date();
  const cutoff = lookbackCutoffDate(now);
  const jobs = sortRecords((state.jobs ?? [])
    .filter((job) => !isExcludedCompactJob(job))
    .filter((job) => shouldRetainJob(job, cutoff))
    .map((job) => ({
      ...job,
      url: jobUrl(job),
      classification: normalizeJobClassification(job.classification),
      suggestedCoverLetter: normalizeSuggestedCoverLetter(job.suggestedCoverLetter, job),
    })));
  return {
    ...state,
    jobs,
    summary: summarize(jobs, state.summary?.source ?? 'cache', state.summary?.fetchedCount ?? null, {
      windowStartDateTime: cutoff.toISOString(),
      windowEndDateTime: now.toISOString(),
    }),
  };
}

export async function loadUpworkJobs() {
  const cached = await readJson(CACHE_PATH, null);
  if (cached) {
    const normalized = normalizeUpworkState(cached);
    if (JSON.stringify(normalized.jobs ?? []) !== JSON.stringify(cached.jobs ?? [])) {
      await writeJson(CACHE_PATH, normalized);
    }
    return normalized;
  }

  return { jobs: [], summary: summarize([], 'empty') };
}

/**
 * Re-poll open in-window jobs the keyword searches missed (postings age out
 * of expression result pages while still live). Jobs gone from the index
 * (hired/closed) are kept unchanged and age out of the window naturally.
 */
export async function sweepRetainedWindowJobs(candidates, lookup, nowIso) {
  const swept = [];
  for (const job of candidates) {
    const node = await lookup(job);
    if (!node || String(node.id) !== String(job.id)) continue;
    swept.push({
      ...job,
      totalApplicants: mergeApplicantCount(node.totalApplicants, job.totalApplicants),
      status: 'active',
      lastSeenAt: nowIso,
    });
  }
  return swept;
}

export async function refreshUpworkJobs() {
  const existingState = await loadUpworkJobs();
  const now = new Date();
  const cutoff = lookbackCutoffDate(now);
  const retainedExisting = (existingState.jobs ?? [])
    .filter((job) => !isExcludedCompactJob(job))
    .filter((job) => shouldRetainJob(job, cutoff));
  const existingById = new Map(retainedExisting.map((job) => [job.id, job]));
  const cutoffIso = cutoff.toISOString();
  const nowIso = now.toISOString();

  // Re-poll the whole window every refresh so applicant counts and budgets
  // stay current; stored PI classifications are reused, so only genuinely new
  // postings cost classifier runs.
  const latest = await fetchRecentPositioningJobs({ sinceDate: cutoff });
  const classified = await classifyRelevantJobs(latest.jobs, existingById);
  const refreshed = classified
    .map((item) => compactJob(item.job, item.laneInfo, existingById.get(item.job.id), nowIso));

  const refreshedIds = new Set(refreshed.map((job) => job.id));
  const retainedMissed = retainedExisting.filter((job) => !refreshedIds.has(job.id));
  const swept = await sweepRetainedWindowJobs(
    retainedMissed.filter((job) => !job.classification && isWithinLookback(job, cutoff)),
    async (job) => (await findJobByTitle(job.title)).find((node) => String(node.id) === String(job.id)) ?? null,
    nowIso,
  );
  const sweptById = new Map(swept.map((job) => [job.id, job]));
  const retained = retainedMissed.map((job) => sweptById.get(job.id) ?? { ...job, status: 'active' });

  const jobs = sortRecords([...refreshed, ...retained]);
  const state = {
    jobs,
    summary: summarize(jobs, POSITIONING_SEARCH_SOURCE, latest.jobs.length, {
      windowStartDateTime: cutoffIso,
      windowEndDateTime: nowIso,
    }),
    upworkSummary: latest.summary,
  };
  await writeJson(CACHE_PATH, state);
  return state;
}

export async function suggestCoverLetterForJob(jobId, options = {}) {
  const state = await loadUpworkJobs();
  const jobs = state.jobs ?? [];
  const index = jobs.findIndex((job) => String(job.id) === String(jobId));
  if (index === -1) {
    throw new Error(`Upwork job not found: ${jobId}`);
  }

  const job = jobs[index];
  if (job.suggestedCoverLetter && !options.force) {
    return {
      jobId: job.id,
      suggestedCoverLetter: normalizeSuggestedCoverLetter(job.suggestedCoverLetter, job),
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

export async function updateUpworkJobClassification(jobId, classification) {
  const normalizedClassification = normalizeJobClassification(classification);
  const state = await loadUpworkJobs();
  const jobs = state.jobs ?? [];
  const index = jobs.findIndex((job) => String(job.id) === String(jobId));
  if (index === -1) {
    throw new Error(`Upwork job not found: ${jobId}`);
  }

  const updatedJobs = [...jobs];
  updatedJobs[index] = {
    ...jobs[index],
    classification: normalizedClassification,
  };
  const updatedState = {
    ...state,
    jobs: updatedJobs,
    summary: summarize(updatedJobs, state.summary?.source ?? 'cache', state.summary?.fetchedCount ?? null, {
      windowStartDateTime: state.summary?.windowStartDateTime,
      windowEndDateTime: state.summary?.windowEndDateTime,
    }),
  };
  await writeJson(CACHE_PATH, updatedState);
  return updatedState;
}

function compactJobToRawJob(job) {
  return {
    ...job,
    amount: null,
    hourlyBudgetMin: null,
    hourlyBudgetMax: null,
    client: {
      name: job.client?.name ?? null,
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

export async function reclassifyUpworkJobs() {
  const existingState = await loadUpworkJobs();
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
