import { spawn } from 'node:child_process';

export const DEFAULT_PI_MODEL = 'zai/glm-5.2';
export const DEFAULT_PI_NODE_PATH = '/opt/homebrew/bin/node';
export const DEFAULT_PI_CLI_PATH = '/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js';
export const DEFAULT_PI_TIMEOUT_MS = 180_000;
export const DEFAULT_PI_THINKING = 'off';

export function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function compactText(value, maxLength = 500) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function jsonCandidates(output) {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let quote = false;
  let escaped = false;

  for (let index = 0; index < output.length; index += 1) {
    const character = output[index];
    if (start === -1) {
      if (character === '{' || character === '[') {
        start = index;
        depth = 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quote = false;
      continue;
    }
    if (character === '"') {
      quote = true;
    } else if (character === '{' || character === '[') {
      depth += 1;
    } else if (character === '}' || character === ']') {
      depth -= 1;
      if (depth === 0) {
        candidates.push(output.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return candidates;
}

export function extractJsonValue(output, expectedType = null) {
  const trimmed = output.trim();
  try {
    const value = JSON.parse(trimmed);
    if (!expectedType || (expectedType === 'array' ? Array.isArray(value) : value && typeof value === 'object' && !Array.isArray(value))) {
      return value;
    }
  } catch {
    // Continue to balanced JSON extraction from code fences or surrounding text.
  }

  const parsed = jsonCandidates(trimmed).flatMap((candidate) => {
    try {
      const value = JSON.parse(candidate);
      const matchesType = !expectedType || (expectedType === 'array'
        ? Array.isArray(value)
        : value && typeof value === 'object' && !Array.isArray(value));
      return matchesType ? [{ candidate, value }] : [];
    } catch {
      return [];
    }
  });
  if (parsed.length === 0) {
    throw new Error(`pi did not return JSON: ${trimmed.slice(0, 500)}`);
  }
  // A model can emit a placeholder such as `{}` before its real answer. The
  // substantive response is normally the largest complete value.
  parsed.sort((left, right) => left.candidate.length - right.candidate.length);
  return parsed.at(-1).value;
}

export function extractPiEventText(output) {
  let finalText = '';
  for (const line of String(output ?? '').split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const event = JSON.parse(line);
      const candidates = [event.message, event.assistantMessageEvent?.partial];
      for (const message of candidates) {
        if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue;
        const text = message.content.filter((item) => item?.type === 'text').map((item) => item.text).join('\n').trim();
        if (text) finalText = text;
      }
    } catch {
      // Ignore non-event output and incomplete streaming lines.
    }
  }
  return finalText;
}

export function runPi(args, options) {
  return new Promise((resolve, reject) => {
    const nodePath = options.nodePath ?? process.env.PI_NODE_PATH ?? DEFAULT_PI_NODE_PATH;
    const child = spawn(nodePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options.cwd,
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

export async function runPiReadOnlyPrompt(prompt, options = {}) {
  const model = options.model ?? process.env.PI_MODEL ?? DEFAULT_PI_MODEL;
  const piNodePath = options.piNodePath ?? process.env.PI_NODE_PATH ?? DEFAULT_PI_NODE_PATH;
  const piCliPath = options.piCliPath ?? process.env.PI_CLI_PATH ?? DEFAULT_PI_CLI_PATH;
  const thinking = options.thinking ?? process.env.PI_GOAL_ASSISTANT_THINKING ?? 'low';
  const timeoutMs = parsePositiveInt(options.timeoutMs ?? process.env.PI_GOAL_ASSISTANT_TIMEOUT_MS, DEFAULT_PI_TIMEOUT_MS);

  try {
    const result = await runPi([
      piCliPath,
      '--model',
      model,
      '--thinking',
      thinking,
      '--mode',
      'json',
      '--tools',
      'read,grep,find,ls',
      '--no-context-files',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--no-prompt-templates',
      '--system-prompt',
      options.systemPrompt,
      '--approve',
      '-p',
      prompt,
    ], { timeoutMs, nodePath: piNodePath, cwd: options.cwd });

    if (result.stderr.trim()) process.stderr.write(result.stderr);
    const finalText = extractPiEventText(result.stdout);
    if (!finalText) throw Object.assign(new Error('pi returned no final assistant message'), result);
    return { ...result, stdout: finalText, eventOutput: result.stdout, model };
  } catch (error) {
    const stderr = compactText(error.stderr, 1200);
    const stdout = compactText(error.stdout, 1200);
    const details = [
      'pi goal assistant failed',
      `model=${model}`,
      error.signal ? `signal=${error.signal}` : null,
      error.code ? `code=${error.code}` : null,
      stderr ? `stderr=${stderr}` : null,
      stdout ? `stdout=${stdout}` : null,
    ].filter(Boolean).join('; ');
    throw new Error(details);
  }
}

export async function runPiPrompt(prompt, options = {}) {
  const model = options.model ?? process.env.PI_MODEL ?? DEFAULT_PI_MODEL;
  const piNodePath = options.piNodePath ?? process.env.PI_NODE_PATH ?? DEFAULT_PI_NODE_PATH;
  const piCliPath = options.piCliPath ?? process.env.PI_CLI_PATH ?? DEFAULT_PI_CLI_PATH;
  const thinking = options.thinking ?? process.env.PI_THINKING ?? DEFAULT_PI_THINKING;
  const timeoutMs = parsePositiveInt(options.timeoutMs ?? process.env.PI_TIMEOUT_MS, DEFAULT_PI_TIMEOUT_MS);

  try {
    const result = await runPi([
      piCliPath,
      '--model',
      model,
      '--thinking',
      thinking,
      '--no-tools',
      '--no-context-files',
      '--no-session',
      '--approve',
      '-p',
      prompt,
    ], { timeoutMs, nodePath: piNodePath });

    if (result.stderr.trim()) process.stderr.write(result.stderr);
    return { ...result, model };
  } catch (error) {
    const stderr = compactText(error.stderr, 1200);
    const stdout = compactText(error.stdout, 1200);
    const details = [
      `pi failed`,
      `model=${model}`,
      `node=${piNodePath}`,
      `cli=${piCliPath}`,
      error.signal ? `signal=${error.signal}` : null,
      error.code ? `code=${error.code}` : null,
      stderr ? `stderr=${stderr}` : null,
      stdout ? `stdout=${stdout}` : null,
    ].filter(Boolean).join('; ');
    throw new Error(details);
  }
}
