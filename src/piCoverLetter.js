import {
  DEFAULT_PI_MODEL,
  compactText,
  extractJsonValue,
  runPiPrompt,
} from './piCli.js';

const MAX_DESCRIPTION_CHARS = 1800;

function promptForCoverLetter(job, retry = false) {
  const retryPrefix = retry
    ? 'Your previous output was invalid. Return complete minified JSON only.\n'
    : '';
  const payload = {
    title: compactText(job.title, 220),
    lane: job.lane,
    budget: job.budget,
    skills: job.skills ?? [],
    client: {
      country: job.client?.country,
      hires: job.client?.hires,
      spent: job.client?.spent,
      verified: job.client?.verificationStatus,
    },
    piReview: job.piClassification?.rationale,
    description: compactText(job.description, MAX_DESCRIPTION_CHARS),
  };

  return `${retryPrefix}Write a concise Upwork proposal cover letter for Ahmed Khattab.
Return JSON only: {"coverLetter":"..."}
Style: direct, confident, practical, no hype, no greeting with client name, no placeholders, no markdown.
Length: 90-140 words.
Mention only relevant fit. Do not promise guaranteed trading returns. Do not mention that AI generated this.
Use this job context: ${JSON.stringify(payload)}`;
}

function validateCoverLetter(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('PI cover letter response is not an object');
  }
  const coverLetter = String(value.coverLetter ?? '').trim();
  if (coverLetter.length < 80) {
    throw new Error('PI cover letter response is too short');
  }
  return coverLetter;
}

export async function generateCoverLetterWithPi(job, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = promptForCoverLetter(job, attempt > 1);
    const result = await runPiPrompt(prompt, {
      model: options.model ?? process.env.PI_COVER_LETTER_MODEL ?? DEFAULT_PI_MODEL,
      timeoutMs: options.timeoutMs ?? process.env.PI_COVER_LETTER_TIMEOUT_MS,
      thinking: options.thinking ?? process.env.PI_COVER_LETTER_THINKING,
    });

    try {
      return {
        text: validateCoverLetter(extractJsonValue(result.stdout)),
        model: result.model,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error;
      process.stderr.write(`PI cover letter retry ${attempt}/2 for ${job.id}: ${error.message}\n`);
    }
  }

  throw lastError;
}
