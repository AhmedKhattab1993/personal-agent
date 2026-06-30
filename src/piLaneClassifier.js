import {
  DEFAULT_PI_CLI_PATH,
  DEFAULT_PI_MODEL,
  DEFAULT_PI_THINKING,
  DEFAULT_PI_TIMEOUT_MS,
  compactText,
  extractJsonValue,
  parsePositiveInt,
  runPiPrompt,
} from './piCli.js';
import { LANES } from './positioningLanes.js';

const DEFAULT_CONCURRENCY = 4;
const MAX_DESCRIPTION_CHARS = 260;
const VALID_LANE_IDS = new Set([...LANES.map((lane) => lane.id), 'reject']);

function skillNames(job) {
  return (job.skills ?? [])
    .map((skill) => (typeof skill === 'string' ? skill : skill.prettyName ?? skill.name))
    .filter(Boolean)
    .slice(0, 12);
}

function keywordSignals(laneInfo) {
  return {
    hint: laneInfo.laneId,
    matches: laneInfo.matches,
    otherHints: laneInfo.matchedLanes
      .filter((item) => item.id !== laneInfo.laneId)
      .map((item) => item.id),
    excludedTrading: laneInfo.excludedTrading,
  };
}

function promptForJob(item, retry = false) {
  const retryPrefix = retry
    ? 'Your previous output was invalid. Return complete minified JSON only, no markdown, no truncation.\n'
    : '';
  return `${retryPrefix}Strictly classify this Upwork job. Keyword lane is only a hint.
Return JSON object only: {"id":"${item.id}","laneId":"trading|ai-agents|automation|reject","rationale":"under 18 words"}
trading=broker APIs, market data, backtesting, execution dashboards, Pine Script, TradingView, MT4/MT5, IBKR, Alpaca, Binance API. Reject AI profit promises, betting, Polymarket, prediction markets, gambling, options trading.
ai-agents=business workflow/research/reporting/CRM/ecommerce/support/internal agents or copilots using Claude/OpenAI/LangChain/RAG with clear workflow/data. Reject AI trading returns or vague chatbot-only jobs.
automation=API integrations, data pipelines, alerts, reports, webhooks, Zapier/Make/n8n, Sheets/Airtable/Slack/CRM integrations, document parsing, repeatable process automation.
Reject ordinary website/app builds, Shopify setup, pure design, mobile app dev, QA, DevOps, generic backend, or outside these lanes.
Job=${JSON.stringify(item)}`;
}

function validateDecision(decision, jobId) {
  if (!decision || typeof decision !== 'object') {
    throw new Error(`pi classifier returned non-object decision for ${jobId}`);
  }
  const id = String(decision.id ?? '');
  const laneId = String(decision.laneId ?? '');
  const rationale = compactText(decision.rationale, 220);

  if (id !== jobId) {
    throw new Error(`pi classifier returned id "${id || '(blank)'}" for job ${jobId}`);
  }
  if (!VALID_LANE_IDS.has(laneId)) {
    throw new Error(`pi classifier returned invalid laneId "${laneId}" for ${id}`);
  }
  if (!rationale) {
    throw new Error(`pi classifier returned empty rationale for ${id}`);
  }

  return { id, laneId, rationale };
}

async function classifyOne(item, options) {
  const model = options.model ?? DEFAULT_PI_MODEL;
  const piCliPath = options.piCliPath ?? DEFAULT_PI_CLI_PATH;
  let lastJsonError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = promptForJob(item, attempt > 1);
    const result = await runPiPrompt(prompt, {
      model,
      piCliPath,
      thinking: options.thinking ?? DEFAULT_PI_THINKING,
      timeoutMs: options.timeoutMs ?? DEFAULT_PI_TIMEOUT_MS,
    }).catch((error) => {
      throw new Error(error.message.replace('pi failed', `pi classifier failed for job ${item.id}`));
    });

    try {
      const value = extractJsonValue(result.stdout);
      const decision = validateDecision(Array.isArray(value) ? value[0] : value, item.id);
      return { ...decision, model: result.model };
    } catch (error) {
      lastJsonError = error;
      process.stderr.write(`PI lane retry ${attempt}/2 for ${item.id}: ${error.message}\n`);
    }
  }

  throw lastJsonError;
}

export function buildPiClassificationItems(items) {
  return items.map(({ job, laneInfo }) => ({
    id: String(job.id),
    title: compactText(job.title, 240),
    description: compactText(job.description, MAX_DESCRIPTION_CHARS),
    skills: skillNames(job),
    keywordSignals: keywordSignals(laneInfo),
  }));
}

export function applyPiLaneDecision(laneInfo, decision) {
  if (decision.laneId === 'reject') {
    return {
      ...laneInfo,
      relevant: false,
      piClassification: decision,
    };
  }

  const lane = LANES.find((item) => item.id === decision.laneId);
  if (!lane) throw new Error(`unknown pi lane id: ${decision.laneId}`);

  const selectedSignals = laneInfo.matchedLanes.find((item) => item.id === decision.laneId)?.matches ?? [];
  return {
    ...laneInfo,
    lane,
    laneId: lane.id,
    laneLabel: lane.label,
    matches: selectedSignals.length > 0 ? selectedSignals : laneInfo.matches,
    keywordLaneId: laneInfo.laneId,
    keywordLaneLabel: laneInfo.laneLabel,
    keywordMatches: laneInfo.matches,
    relevant: true,
    piClassification: decision,
  };
}

export async function classifyLaneCandidatesWithPi(items, options = {}) {
  const concurrency = parsePositiveInt(options.concurrency ?? process.env.PI_LANE_CONCURRENCY, DEFAULT_CONCURRENCY);
  const model = options.model ?? process.env.PI_LANE_MODEL ?? DEFAULT_PI_MODEL;
  const piCliPath = options.piCliPath ?? process.env.PI_CLI_PATH ?? DEFAULT_PI_CLI_PATH;
  const timeoutMs = parsePositiveInt(options.timeoutMs ?? process.env.PI_LANE_TIMEOUT_MS, DEFAULT_PI_TIMEOUT_MS);
  const thinking = options.thinking ?? process.env.PI_LANE_THINKING ?? DEFAULT_PI_THINKING;
  const classificationItems = buildPiClassificationItems(items);
  const decisionsById = new Map();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < classificationItems.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = classificationItems[index];
      process.stderr.write(`PI lane job ${index + 1}/${classificationItems.length} ${item.id}\n`);
      const decision = await classifyOne(item, { model, piCliPath, timeoutMs, thinking });
      decisionsById.set(decision.id, decision);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, classificationItems.length) }, () => worker()));

  return items.map((item) => {
    const decision = decisionsById.get(String(item.job.id));
    if (!decision) throw new Error(`pi classifier did not return a decision for ${item.job.id}`);
    return {
      job: item.job,
      laneInfo: applyPiLaneDecision(item.laneInfo, decision),
    };
  });
}
