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
const DEFAULT_BATCH_SIZE = 12;
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
  };
}

function promptForBatch(items, retry = false) {
  const retryPrefix = retry
    ? 'Your previous output was invalid. Return complete minified JSON only, no markdown, no truncation.\n'
    : '';
  return `${retryPrefix}Strictly classify these Upwork jobs using the whole title, description, skills, and keyword signals together. Keyword matches are weak hints only; never reject or accept from a keyword alone.
Return JSON array only, one object per input in the same order: [{"id":"...","laneId":"trading|ai-agents|automation|reject","rationale":"under 18 words"}]
trading=broker APIs, market data, backtesting, execution dashboards, Pine Script, TradingView, MT4/MT5, IBKR, Alpaca, Binance API, trading bots, trading automation, trading analytics, and paper-trading prototypes. Reject only when full context shows betting/gambling, Polymarket, options-only work, or explicit promises of guaranteed/profitable AI trading returns.
ai-agents=business workflow/research/reporting/CRM/ecommerce/support/internal agents or copilots using Claude/OpenAI/LangChain/RAG with clear workflow/data. Do not reject a trading infrastructure job merely because it uses OpenAI or LLMs; classify by the actual project context.
automation=API integrations, data pipelines, alerts, reports, webhooks, Zapier/Make/n8n, Sheets/Airtable/Slack/CRM integrations, document parsing, repeatable process automation.
Reject ordinary website/app builds, Shopify setup, pure design, mobile app dev, QA, DevOps, generic backend, or outside these lanes.
Jobs=${JSON.stringify(items)}`;
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

async function classifyBatch(items, options) {
  let lastJsonError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = promptForBatch(items, attempt > 1);
    const result = await runPiPrompt(prompt, options).catch((error) => {
      const ids = items.map((item) => item.id).join(',');
      throw new Error(error.message.replace('pi failed', `pi classifier failed for jobs ${ids}`));
    });

    try {
      const value = extractJsonValue(result.stdout, 'array');
      if (!Array.isArray(value)) {
        throw new Error('pi classifier returned non-array batch response');
      }
      const decisionsById = new Map();
      for (const decision of value) {
        if (decision?.id && !decisionsById.has(String(decision.id))) {
          decisionsById.set(String(decision.id), decision);
        }
      }
      return items.map((item) => ({
        ...validateDecision(decisionsById.get(item.id), item.id),
        model: result.model,
      }));
    } catch (error) {
      lastJsonError = error;
      process.stderr.write(`PI lane batch retry ${attempt}/2: ${error.message}\n`);
    }
  }

  throw lastJsonError;
}

function buildPiClassificationItems(items) {
  return items.map(({ job, laneInfo }) => ({
    id: String(job.id),
    title: compactText(job.title, 240),
    description: compactText(job.description, MAX_DESCRIPTION_CHARS),
    skills: skillNames(job),
    keywordSignals: keywordSignals(laneInfo),
  }));
}

function applyPiLaneDecision(laneInfo, decision) {
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
  const batchSize = parsePositiveInt(options.batchSize ?? process.env.PI_LANE_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const classificationItems = buildPiClassificationItems(items);
  const batches = [];
  for (let index = 0; index < classificationItems.length; index += batchSize) {
    batches.push(classificationItems.slice(index, index + batchSize));
  }
  const decisionsById = new Map();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < batches.length) {
      const index = nextIndex;
      nextIndex += 1;
      const batch = batches[index];
      process.stderr.write(`PI lane batch ${index + 1}/${batches.length} ${batch[0].id}..${batch[batch.length - 1].id}\n`);
      const decisions = await classifyBatch(batch, { model, piCliPath, timeoutMs, thinking });
      for (const decision of decisions) {
        decisionsById.set(decision.id, decision);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));

  return items.map((item) => {
    const decision = decisionsById.get(String(item.job.id));
    if (!decision) throw new Error(`pi classifier did not return a decision for ${item.job.id}`);
    return {
      job: item.job,
      laneInfo: applyPiLaneDecision(item.laneInfo, decision),
    };
  });
}
