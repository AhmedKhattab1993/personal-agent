const UNKNOWN_EFFORT_HOURS = 160;
const FIXED_EFFORT_BUFFER = 1.5;
const ECONOMIC_RATE_CEILING = 60;
const MAX_RISK_PENALTY = 15;

const PRIORITY_WEIGHTS = Object.freeze({
  fit: 0.15,
  economics: 0.10,
  winability: 0.70,
  scopeConfidence: 0.05,
});

const DURATION_WEEKS = [
  [/less than 1 month/i, 3],
  [/1 to 3 months/i, 8],
  [/3 to 6 months/i, 18],
  [/more than 6 months/i, 32],
];

const FIXED_EFFORT_HOURS = [
  [/less than 1 month/i, 40],
  [/1 to 3 months/i, 120],
  [/3 to 6 months/i, 280],
  [/more than 6 months/i, 560],
];

const WEEKLY_HOURS = [
  [/less than 30 hrs\/week/i, 20],
  [/30\+ hrs\/week/i, 35],
];

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validDateValue(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function matchValue(value, table) {
  const text = String(value ?? '');
  const match = table.find(([pattern]) => pattern.test(text));
  return match?.[1] ?? null;
}

function parseMoneyValues(value) {
  return String(value ?? '')
    .match(/\d[\d,]*(?:\.\d+)?/g)
    ?.map((item) => Number(item.replaceAll(',', '')))
    .filter((item) => Number.isFinite(item) && item > 0) ?? [];
}

function parseCompactMoney(value) {
  const text = String(value ?? '').replaceAll(',', '').trim();
  const match = text.match(/(\d+(?:\.\d+)?)\s*([kmb])?/i);
  if (!match) return null;
  const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[match[2]?.toLowerCase()] ?? 1;
  return Number(match[1]) * multiplier;
}

export function parseBudget(budget) {
  const text = String(budget ?? '').trim();
  if (!text) return null;

  const values = parseMoneyValues(text);
  if (values.length === 0) return null;

  const isHourly = /\/\s*hr\b|per\s+hour|hourly/i.test(text);
  if (isHourly) {
    const min = values[0];
    const max = values[1] ?? min;
    return {
      type: 'hourly',
      hourlyRate: (min + max) / 2,
      conservativeHourlyRate: min + (max - min) * 0.25,
      min,
      max,
    };
  }

  const min = values[0];
  const max = values[1] ?? min;
  return {
    type: 'fixed',
    fixedPayment: (min + max) / 2,
    min,
    max,
  };
}

export function estimateEffortHours(job) {
  const weeklyHours = matchValue(job?.engagement, WEEKLY_HOURS);
  const durationWeeks = matchValue(job?.durationLabel, DURATION_WEEKS);

  if (weeklyHours && durationWeeks) return weeklyHours * durationWeeks;

  return matchValue(job?.durationLabel, FIXED_EFFORT_HOURS) ?? UNKNOWN_EFFORT_HOURS;
}

export function estimateEconomicValue(job) {
  const budget = parseBudget(job?.budget);
  const baseEffortHours = estimateEffortHours(job);
  if (!budget || !Number.isFinite(baseEffortHours) || baseEffortHours <= 0) {
    return {
      rankable: false,
      hourlyEquivalent: null,
      expectedPayment: null,
      effortHours: Number.isFinite(baseEffortHours) ? baseEffortHours : null,
      budgetType: budget?.type ?? null,
      method: 'unrated',
    };
  }

  if (budget.type === 'hourly') {
    const hourlyEquivalent = budget.conservativeHourlyRate;
    return {
      rankable: true,
      hourlyEquivalent,
      expectedPayment: hourlyEquivalent * baseEffortHours,
      effortHours: baseEffortHours,
      budgetType: budget.type,
      budgetMin: budget.min,
      budgetMax: budget.max,
      method: 'hourly_range_lower_quartile',
    };
  }

  const effortHours = baseEffortHours * FIXED_EFFORT_BUFFER;
  return {
    rankable: true,
    hourlyEquivalent: budget.fixedPayment / effortHours,
    expectedPayment: budget.fixedPayment,
    effortHours,
    budgetType: budget.type,
    budgetMin: budget.min,
    budgetMax: budget.max,
    method: 'fixed_budget_buffered_effort',
  };
}

function fitScore(job) {
  const matches = new Set((job?.laneMatches ?? []).filter(Boolean));
  const piAligned = Boolean(job?.laneId && job?.piClassification?.laneId === job.laneId);
  return clamp(55 + Math.min(matches.size, 4) * 7 + (piAligned ? 12 : 0));
}

function economicsScore(economic) {
  if (!economic.rankable) return 45;
  return clamp(Math.sqrt(economic.hourlyEquivalent / ECONOMIC_RATE_CEILING) * 100);
}

function ageHours(job, referenceTime) {
  const published = validDateValue(job?.publishedDateTime ?? job?.lastSeenAt);
  const reference = validDateValue(referenceTime ?? job?.lastSeenAt);
  if (published === null || reference === null) return null;
  return Math.max(0.25, (reference - published) / (60 * 60 * 1000));
}

function winabilityScore(job, referenceTime) {
  const applicants = numberValue(job?.totalApplicants);
  const age = ageHours(job, referenceTime);
  if (applicants === null && age === null) return 50;

  const competition = applicants === null
    ? 50
    : 100 / (1 + applicants / 20 + (applicants / (age ?? 24)) * 2);
  const freshness = age === null ? 50 : 100 * (2 ** (-age / 48));
  return clamp(competition * 0.75 + freshness * 0.25);
}

function clientQualityScore(job) {
  const client = job?.client ?? {};
  const hires = numberValue(client.hires) ?? 0;
  const postedJobs = numberValue(client.postedJobs) ?? 0;
  const spend = parseCompactMoney(client.spent) ?? 0;
  const feedback = clamp(numberValue(client.feedback) ?? 0, 0, 5);
  const reviews = Math.max(0, numberValue(client.reviews) ?? 0);

  const verified = client.verificationStatus === 'VERIFIED' ? 25 : 0;
  const smoothedHireRate = clamp((hires + 5) / (postedJobs + 10), 0, 1);
  const hiring = smoothedHireRate * 35;
  const spending = clamp(Math.log1p(spend) / Math.log1p(50_000), 0, 1) * 20;
  const reviewConfidence = clamp(Math.log1p(reviews) / Math.log1p(20), 0, 1);
  const reputation = (feedback / 5) * reviewConfidence * 20;
  return clamp(verified + hiring + spending + reputation);
}

function scopeConfidenceScore(job, economic) {
  const descriptionLength = String(job?.description ?? '').trim().length;
  const description = descriptionLength >= 600 ? 30 : descriptionLength >= 250 ? 22 : descriptionLength >= 100 ? 14 : 5;
  const budget = economic.rankable ? 20 : 0;
  const duration = job?.durationLabel ? 15 : 0;
  const experience = job?.experienceLevel ? 10 : 0;
  const skills = Math.min((job?.skills ?? []).filter(Boolean).length, 5) * 3;
  const rationale = job?.piClassification?.rationale ? 10 : 0;
  return clamp(description + budget + duration + experience + skills + rationale);
}

function riskPenalty(job, economic) {
  const budget = parseBudget(job?.budget);
  let penalty = 0;

  if (!economic.rankable) penalty += 2;
  if (economic.budgetType === 'fixed') penalty += 3;
  if (economic.rankable && economic.hourlyEquivalent < 10) penalty += 4;
  if (budget?.type === 'hourly' && budget.min > 0) {
    penalty += clamp((budget.max / budget.min - 2) * 2, 0, 8);
  }
  if (job?.client?.verificationStatus !== 'VERIFIED') penalty += 3;
  if ((numberValue(job?.client?.postedJobs) ?? 0) === 0) penalty += 2;
  if (String(job?.description ?? '').trim().length < 200) penalty += 2;

  return clamp(penalty, 0, MAX_RISK_PENALTY);
}

function confidenceLevel(job, economic) {
  let evidence = 0;
  if (economic.rankable) evidence += 1;
  if (numberValue(job?.totalApplicants) !== null && validDateValue(job?.publishedDateTime) !== null) evidence += 1;
  if (job?.piClassification?.laneId === job?.laneId) evidence += 1;
  if ((numberValue(job?.client?.postedJobs) ?? 0) > 0 || parseCompactMoney(job?.client?.spent) > 0) evidence += 1;
  if (String(job?.description ?? '').trim().length >= 250) evidence += 1;
  if (job?.durationLabel && job?.experienceLevel) evidence += 1;

  if (evidence >= 5) return 'high';
  if (evidence >= 3) return 'medium';
  return 'low';
}

export function estimateOpportunity(job, referenceTime = null) {
  const economic = estimateEconomicValue(job);
  const components = {
    fit: fitScore(job),
    economics: economicsScore(economic),
    winability: winabilityScore(job, referenceTime),
    clientQuality: clientQualityScore(job),
    scopeConfidence: scopeConfidenceScore(job, economic),
  };
  const penalty = riskPenalty(job, economic);
  const weighted = Object.entries(PRIORITY_WEIGHTS)
    .reduce((total, [name, weight]) => total + components[name] * weight, 0);

  return {
    rankable: true,
    score: round(clamp(weighted - penalty)),
    economic,
    components: Object.fromEntries(Object.entries(components).map(([name, value]) => [name, round(value)])),
    riskPenalty: round(penalty),
    confidence: confidenceLevel(job, economic),
  };
}

function dateValue(job) {
  return validDateValue(job?.publishedDateTime ?? job?.lastSeenAt) ?? 0;
}

function compareNewest(a, b) {
  const dateDiff = dateValue(b) - dateValue(a);
  if (dateDiff !== 0) return dateDiff;
  return String(a?.title ?? '').localeCompare(String(b?.title ?? ''));
}

function compareOpportunity(a, b, referenceTime) {
  const aEstimate = estimateOpportunity(a, referenceTime);
  const bEstimate = estimateOpportunity(b, referenceTime);

  const scoreDiff = bEstimate.score - aEstimate.score;
  if (scoreDiff !== 0) return scoreDiff;

  const economicDiff = (bEstimate.economic.hourlyEquivalent ?? 0) - (aEstimate.economic.hourlyEquivalent ?? 0);
  if (economicDiff !== 0) return economicDiff;

  return compareNewest(a, b);
}

function compareEconomic(a, b) {
  const aEconomic = estimateEconomicValue(a);
  const bEconomic = estimateEconomicValue(b);
  const aRankable = Number.isFinite(aEconomic.hourlyEquivalent);
  const bRankable = Number.isFinite(bEconomic.hourlyEquivalent);

  if (aRankable !== bRankable) return bRankable - aRankable;
  if (aRankable) {
    const economicDiff = bEconomic.hourlyEquivalent - aEconomic.hourlyEquivalent;
    if (economicDiff !== 0) return economicDiff;
  }

  return compareNewest(a, b);
}

export function sortJobsForDisplay(jobs, sortMode, referenceTime = null) {
  const records = [...jobs];
  if (sortMode === 'opportunity') return records.sort((a, b) => compareOpportunity(a, b, referenceTime));
  if (sortMode === 'economic') return records.sort(compareEconomic);
  return records.sort(compareNewest);
}

export function filterJobsByPublishedHours(jobs, hours, referenceTime) {
  const parsedHours = Number(hours);
  const reference = validDateValue(referenceTime);
  if (!Number.isFinite(parsedHours) || parsedHours <= 0 || reference === null) return [...jobs];

  const cutoff = reference - parsedHours * 60 * 60 * 1000;
  return jobs.filter((job) => {
    const published = validDateValue(job?.publishedDateTime ?? job?.lastSeenAt);
    return published !== null && published >= cutoff && published <= reference;
  });
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

export function formatEconomicValue(economic) {
  if (!economic?.rankable) return 'Economics unknown';
  return `${formatMoney(economic.hourlyEquivalent)}/hr est`;
}

export function formatOpportunityBadge(estimate) {
  if (!estimate?.rankable) return 'Priority unavailable';
  return `Priority ${Math.round(estimate.score)}/100 · ${formatEconomicValue(estimate.economic)}`;
}

export function formatOpportunityTitle(estimate) {
  if (!estimate?.rankable) return 'Apply priority is unavailable.';
  const components = estimate.components;
  return [
    `Apply priority ${Math.round(estimate.score)}/100`,
    `fit ${Math.round(components.fit)}`,
    `economics ${Math.round(components.economics)}`,
    `winability ${Math.round(components.winability)}`,
    `client ${Math.round(components.clientQuality)}`,
    `scope ${Math.round(components.scopeConfidence)}`,
    `risk -${Math.round(estimate.riskPenalty)}`,
    `${estimate.confidence} confidence`,
  ].join(' · ');
}
