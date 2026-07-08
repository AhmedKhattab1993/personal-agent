import {
  DEFAULT_PI_MODEL,
  compactText,
  extractJsonValue,
  runPiPrompt,
} from './piCli.js';

const MAX_DESCRIPTION_CHARS = 1800;
export const ASYNC_COMMUNICATION_CLOSING = 'I’m a strong believer in clear and efficient async communication. I typically share updates, feedback, and deliverables via detailed messages and screen-recorded videos (Loom) so you can review everything at your convenience with full context. This approach helps us move faster while avoiding unnecessary meeting fatigue. I’m also happy to schedule a short call if it’s needed to align on scope or clarify complex requirements.';
const SIGNOFF = 'Thanks, Ahmed';

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
      name: clientName(job),
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
Style: direct, confident, practical, no hype, no greeting, no signoff, no placeholders, no markdown.
Length: 90-140 words before the fixed final paragraph.
Mention only relevant fit. Do not promise guaranteed trading returns. Do not mention that AI generated this.
The system will add the greeting, this exact final paragraph, and the Thanks/Ahmed signoff after your cover letter, so do not write or paraphrase them yourself: ${ASYNC_COMMUNICATION_CLOSING}
Use this job context: ${JSON.stringify(payload)}`;
}

function clientName(job) {
  return String(
    job.client?.name
      ?? job.client?.firstName
      ?? job.client?.contactName
      ?? job.clientName
      ?? ''
  ).trim();
}

function greetingForJob(job) {
  const name = clientName(job);
  return name ? `Hi ${name},` : 'Hi,';
}

function withoutTemplateParts(text) {
  let result = String(text ?? '').trim();
  result = result.replace(/^Hi(?:\s+[^,\n]+)?[,]?\s*\n+/i, '').trim();
  result = result.replace(/\n*\s*Thanks,\s*(?:\n\s*)?Ahmed\s*$/i, '').trim();
  const normalized = result.replace(/[‘’]/g, "'");
  const marker = "I'm a strong believer in clear and efficient async communication.";
  const markerIndex = normalized.indexOf(marker);
  return markerIndex === -1 ? result : result.slice(0, markerIndex).trim();
}

export function ensureProposalTemplate(text, job = null) {
  const coverLetter = withoutTemplateParts(text);
  const body = coverLetter ? `${coverLetter}\n\n${ASYNC_COMMUNICATION_CLOSING}` : ASYNC_COMMUNICATION_CLOSING;
  return `${greetingForJob(job)}\n\n${body}\n\n${SIGNOFF}`;
}

function validateCoverLetter(value, job) {
  if (!value || typeof value !== 'object') {
    throw new Error('PI cover letter response is not an object');
  }
  const coverLetter = withoutTemplateParts(value.coverLetter);
  if (coverLetter.length < 80) {
    throw new Error('PI cover letter response is too short');
  }
  return ensureProposalTemplate(coverLetter, job);
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
        text: validateCoverLetter(extractJsonValue(result.stdout), job),
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
