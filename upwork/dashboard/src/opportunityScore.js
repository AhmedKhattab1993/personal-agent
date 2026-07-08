const UNKNOWN_EFFORT_HOURS = 160;

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

function validDateValue(value) {
  const time = new Date(value ?? 0).getTime();
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

export function estimateOpportunity(job) {
  const budget = parseBudget(job?.budget);
  const effortHours = estimateEffortHours(job);
  if (!budget || !Number.isFinite(effortHours) || effortHours <= 0) {
    return {
      rankable: false,
      score: Number.NEGATIVE_INFINITY,
      expectedPayment: null,
      effortHours: Number.isFinite(effortHours) ? effortHours : null,
      budgetType: budget?.type ?? null,
    };
  }

  const expectedPayment = budget.type === 'hourly'
    ? budget.hourlyRate * effortHours
    : budget.fixedPayment;

  return {
    rankable: true,
    score: expectedPayment / effortHours,
    expectedPayment,
    effortHours,
    budgetType: budget.type,
    hourlyRate: budget.hourlyRate ?? null,
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

function compareOpportunity(a, b) {
  const aEstimate = estimateOpportunity(a);
  const bEstimate = estimateOpportunity(b);

  if (aEstimate.rankable !== bEstimate.rankable) {
    return bEstimate.rankable ? 1 : -1;
  }

  const scoreDiff = bEstimate.score - aEstimate.score;
  if (Number.isFinite(scoreDiff) && scoreDiff !== 0) return scoreDiff;

  const paymentDiff = (bEstimate.expectedPayment ?? 0) - (aEstimate.expectedPayment ?? 0);
  if (paymentDiff !== 0) return paymentDiff;

  const effortDiff = (aEstimate.effortHours ?? UNKNOWN_EFFORT_HOURS) - (bEstimate.effortHours ?? UNKNOWN_EFFORT_HOURS);
  if (effortDiff !== 0) return effortDiff;

  return compareNewest(a, b);
}

export function sortJobsForDisplay(jobs, sortMode) {
  const records = [...jobs];
  if (sortMode === 'opportunity') return records.sort(compareOpportunity);
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
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

export function formatOpportunityBadge(estimate) {
  if (!estimate?.rankable) return 'Opportunity unrated';
  return `${formatMoney(estimate.score)}/hr eq`;
}

export function formatOpportunityTitle(estimate) {
  if (!estimate?.rankable) return 'Budget is missing or unreadable, so this job sorts below scored jobs.';

  const payment = formatMoney(estimate.expectedPayment);
  const effort = Math.round(estimate.effortHours);
  return `${payment} estimated payment across ${effort}h estimated work`;
}
