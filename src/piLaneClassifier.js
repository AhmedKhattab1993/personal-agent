import { spawn } from 'node:child_process';

import { LANES } from './positioningLanes.js';

const DEFAULT_MODEL = 'zai/glm-5.2';
const DEFAULT_PI_CLI_PATH = '/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js';
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_THINKING = 'off';
const MAX_DESCRIPTION_CHARS = 260;
const VALID_LANE_IDS = new Set([...LANES.map((lane) => lane.id), 'reject']);

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function compactText(value, maxLength = MAX_DESCRIPTION_CHARS) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

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

function extractJsonValue(output) {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to extracting JSON from accidental code fences or surrounding text.
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`pi classifier did not return JSON: ${trimmed.slice(0, 500)}`);
  }
  return JSON.parse(trimmed.slice(start, end + 1));
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

function runPi(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`pi exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      error.code = code;
      error.signal = signal;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function classifyOne(item, options) {
  const model = options.model ?? DEFAULT_MODEL;
  const piCliPath = options.piCliPath ?? process.env.PI_CLI_PATH ?? DEFAULT_PI_CLI_PATH;
  let lastJsonError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = promptForJob(item, attempt > 1);
    let result;
    try {
      result = await runPi([
        piCliPath,
        '--model',
        model,
        '--thinking',
        options.thinking ?? DEFAULT_THINKING,
        '--no-tools',
        '--no-context-files',
        '--no-session',
        '--approve',
        '-p',
        prompt,
      ], {
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
    } catch (error) {
      const stderr = compactText(error.stderr, 1200);
      const stdout = compactText(error.stdout, 1200);
      const details = [
        `pi classifier failed for job ${item.id}`,
        `model=${model}`,
        `cli=${piCliPath}`,
        error.signal ? `signal=${error.signal}` : null,
        error.code ? `code=${error.code}` : null,
        stderr ? `stderr=${stderr}` : null,
        stdout ? `stdout=${stdout}` : null,
      ].filter(Boolean).join('; ');
      throw new Error(details);
    }

    const { stdout, stderr } = result;
    try {
      const value = extractJsonValue(stdout);
      const decision = validateDecision(Array.isArray(value) ? value[0] : value, item.id);
      if (stderr.trim()) {
        process.stderr.write(stderr);
      }
      return { ...decision, model };
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
    description: compactText(job.description),
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
  const model = options.model ?? process.env.PI_LANE_MODEL ?? DEFAULT_MODEL;
  const piCliPath = options.piCliPath ?? process.env.PI_CLI_PATH ?? DEFAULT_PI_CLI_PATH;
  const timeoutMs = parsePositiveInt(options.timeoutMs ?? process.env.PI_LANE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const thinking = options.thinking ?? process.env.PI_LANE_THINKING ?? DEFAULT_THINKING;
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
