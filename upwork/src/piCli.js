import { spawn } from 'node:child_process';

export const DEFAULT_PI_MODEL = 'zai/glm-5.2';
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

export function extractJsonValue(output) {
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
    throw new Error(`pi did not return JSON: ${trimmed.slice(0, 500)}`);
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function runPi(args, options) {
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

export async function runPiPrompt(prompt, options = {}) {
  const model = options.model ?? process.env.PI_MODEL ?? DEFAULT_PI_MODEL;
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
    ], { timeoutMs });

    if (result.stderr.trim()) process.stderr.write(result.stderr);
    return { ...result, model };
  } catch (error) {
    const stderr = compactText(error.stderr, 1200);
    const stdout = compactText(error.stdout, 1200);
    const details = [
      `pi failed`,
      `model=${model}`,
      `cli=${piCliPath}`,
      error.signal ? `signal=${error.signal}` : null,
      error.code ? `code=${error.code}` : null,
      stderr ? `stderr=${stderr}` : null,
      stdout ? `stdout=${stdout}` : null,
    ].filter(Boolean).join('; ');
    throw new Error(details);
  }
}
