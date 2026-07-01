import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRIMARY_TAGS = new Set([
  'web-app-development',
  'web-design',
  'conversion-seo-sales',
  'ecommerce-storefront',
  'mobile-app',
  'ai-apps-agents',
  'automation-integration',
  'crm-erp-business-systems',
  'data-scraping-pipelines',
  'backend-api-infrastructure',
  'qa-testing-review',
  'trading-software',
  'blockchain-web3',
  'game-3d-interactive',
  'desktop-embedded-systems',
  'product-project-technical-management',
]);

const INTENTS = new Set(['build', 'redesign', 'fix', 'extend', 'optimize', 'migrate', 'audit', 'maintain', 'consult']);
const CONFIDENCES = new Set(['high', 'medium', 'low']);

const RULES = [
  {
    tag: 'qa-testing-review',
    patterns: [/\bqa\b/, /\bquality assurance\b/, /\bsoftware tester\b/, /\bmanual tester\b/, /\bqa tester\b/, /\btesters?\b/, /\btesting of\b/, /\bclosed testing\b/, /\btest plan\b/, /\bbug report\b/, /\busability testing\b/, /\bsecurity review\b/, /\bvalidate\b.*\bmarketplace\b/],
    rationale: 'The posting is primarily asking for testing, review, or quality assurance.',
  },
  {
    tag: 'trading-software',
    patterns: [/\btrading\b/, /\btrade copier\b/, /\bmarket data\b/, /\bbacktest(?:ing)?\b/, /\bmetatrader\b/, /\bmt4\b/, /\bmt5\b/, /\btradingview\b/, /\bninjatrader\b/, /\binteractive brokers\b/, /\balpaca\b/, /\bbinance\b/, /\bcoinbase\b/, /\bbroker api\b/, /\border routing\b/, /\bforex\b/, /\bcrypto exchange\b/],
    rationale: 'The business outcome centers on market data, broker/exchange integration, or trade execution.',
  },
  {
    tag: 'ecommerce-storefront',
    patterns: [/\bshopify\b/, /\bwoocommerce\b/, /\bmagento\b/, /\bbigcommerce\b/, /\bonline store\b/, /\bstorefront\b/, /\bproduct upload\b/, /\bproduct listing\b/, /\btheme tweak\b/, /\bstore setup\b/],
    rationale: 'The posting is mainly ecommerce platform setup, configuration, product listing, or storefront administration.',
  },
  {
    tag: 'crm-erp-business-systems',
    patterns: [/\bzoho\b/, /\bsalesforce\b/, /\bhubspot\b/, /\berpnext\b/, /\bodoo\b/, /\bairtable\b/, /\bnotion\b/, /\bcrm(?!-style)\b/, /\berp\b/, /\bcustomer relationship management\b/, /\binventory system\b/, /\binvoice system\b/],
    rationale: 'The requested work is for a business operations platform or CRM/ERP-style system.',
  },
  {
    tag: 'ai-apps-agents',
    patterns: [/\bai agent\b/, /\bagents?\b/, /\brag\b/, /\bchatbot\b/, /\bcopilot\b/, /\bai saas\b/, /\bai platform\b/, /\bllm workflow\b/, /\bgenerative ai\b/, /\bai receptionist\b/, /\bopenai\b/, /\bclaude\b/, /\bdeepseek\b/, /\blangchain\b/, /\bllm\b/, /\bai integration\b/, /\bai feature\b/, /\bai summary\b/, /\bai support\b/, /\bai automation\b/, /\bai solutions\b/, /\bprompt\b/],
    rationale: 'AI is central to the requested product, feature, or workflow outcome.',
  },
  {
    tag: 'mobile-app',
    patterns: [/\bios\b/, /\bandroid\b/, /\bflutter\b/, /\breact native\b/, /\bmobile app\b/, /\bapp store\b/, /\bswift\b/, /\bkotlin\b/],
    rationale: 'The requested product is a native or cross-platform mobile application.',
  },
  {
    tag: 'blockchain-web3',
    patterns: [/\bsmart contract\b/, /\bweb3\b/, /\bblockchain\b/, /\bnft\b/, /\bdefi\b/, /\bwallet\b/, /\btoken\b/, /\bsolidity\b/],
    rationale: 'The work is a blockchain or Web3 system not primarily about trading execution.',
  },
  {
    tag: 'game-3d-interactive',
    patterns: [/\bunity\b/, /\bunreal\b/, /\bcocos\b/, /\bgame\b/, /\b3d\b/, /\bar\b/, /\bvr\b/, /\bsimulation\b/],
    rationale: 'The posting asks for a game, 3D, AR/VR, or interactive simulation experience.',
  },
  {
    tag: 'desktop-embedded-systems',
    patterns: [/\bdesktop app\b/, /\belectron\b/, /\bbrowser extension\b/, /\bchrome extension\b/, /\bfirmware\b/, /\bembedded\b/, /\bhardware\b/, /\biot\b/, /\bwindows app\b/, /\bmacos app\b/],
    rationale: 'The requested software is local, desktop, extension, firmware, or hardware-adjacent.',
  },
  {
    tag: 'product-project-technical-management',
    patterns: [/\bproduct owner\b/, /\btechnical pm\b/, /\bproject manager\b/, /\bscrum master\b/, /\bspecification writer\b/, /\bengineering coordination\b/],
    rationale: 'The posting is mainly for technical product, project, or delivery management.',
  },
  {
    tag: 'data-scraping-pipelines',
    patterns: [/\bscrap(?:e|ing|er)\b/, /\bcrawl(?:er|ing)?\b/, /\betl\b/, /\bdata extraction\b/, /\bcsv\b/, /\bexcel\b/, /\banalytics dashboard\b/, /\bbi\b/, /\breporting pipeline\b/, /\bdatabase cleanup\b/],
    rationale: 'The work is primarily data extraction, transformation, reporting, or analytics pipeline work.',
  },
  {
    tag: 'automation-integration',
    patterns: [/\bzapier\b/, /\bmake\.com\b/, /\bn8n\b/, /\bapi sync\b/, /\bwebhook flow\b/, /\bworkflow automation\b/, /\bbusiness process automation\b/, /\bautomate (?:manual|repetitive|tasks|process|workflow|emails?|notifications?|lead)/, /\blead routing\b/, /\bdocument parsing\b/, /\bspreadsheet-to-system\b/, /\bgoogle sheets automation\b/],
    rationale: 'The buyer mainly needs workflow automation or systems connected together.',
  },
  {
    tag: 'web-design',
    patterns: [/\bfigma\b/, /\bui\/ux\b/, /\bux\/ui\b/, /\bmock-?up\b/, /\bwireframe\b/, /\bprototype\b/, /\bhomepage concept\b/, /\btheme design\b/, /\bstyle guide\b/, /\bmood board\b/, /\bbrand identity\b/, /\bvisual redesign\b/, /\bdesigner\b/],
    rationale: 'The posting is primarily design, UX, mockup, branding, or visual web work rather than implementation.',
  },
  {
    tag: 'conversion-seo-sales',
    patterns: [/\bseo\b/, /\bcro\b/, /\bconversion(?: rate)? optimization\b/, /\bincrease (?:sales|leads|conversions|traffic)\b/, /\bsales funnel\b/, /\blead generation\b/, /\btechnical seo\b/, /\bgoogle analytics\b/, /\btracking setup\b/, /\bad pixel\b/, /\bmeta pixel\b/, /\bspeed optimization\b/, /\bpage speed\b/],
    rationale: 'The main outcome is more traffic, leads, conversions, sales, or measurable marketing performance.',
  },
  {
    tag: 'web-app-development',
    patterns: [/\bwordpress\b/, /\bwebflow\b/, /\bwix\b/, /\bsquarespace\b/, /\blanding page\b/, /\bwebsite\b/, /\bhomepage\b/, /\bportfolio\b/, /\bcms\b/, /\bsaas\b/, /\bdashboard\b/, /\badmin panel\b/, /\bcustomer portal\b/, /\bmarketplace\b/, /\bbooking platform\b/, /\binternal web app\b/, /\bweb app\b/, /\bfull stack\b/, /\blogin\b/, /\bcheckout\b/, /\bpayment\b/, /\bcustom shopify\b/, /\bcustom woocommerce\b/],
    rationale: 'The posting is real web development across websites, web apps, SaaS, portals, marketplaces, or custom ecommerce.',
  },
  {
    tag: 'backend-api-infrastructure',
    patterns: [/\bapi\b/, /\bbackend\b/, /\bdatabase\b/, /\bauth\b/, /\baws\b/, /\bgcp\b/, /\bazure\b/, /\bdocker\b/, /\bdevops\b/, /\bdeployment\b/, /\bserver\b/, /\bmigration\b/, /\bperformance\b/],
    rationale: 'The main ask is backend, API, database, cloud, deployment, or infrastructure work.',
  },
];

const STACK_RULES = [
  ['wordpress', /\bwordpress\b/],
  ['shopify', /\bshopify\b/],
  ['webflow-wix', /\b(webflow|wix|squarespace)\b/],
  ['react-next', /\b(react|next\.?js|typescript)\b/],
  ['node-python', /\b(node\.?js|express|nest\.?js|python|django|fastapi)\b/],
  ['php-laravel', /\b(php|laravel|symfony)\b/],
  ['flutter-react-native', /\b(flutter|react native)\b/],
  ['ios-android', /\b(ios|android|swift|kotlin)\b/],
  ['openai-llm', /\b(openai|claude|deepseek|langchain|llm|chatgpt|gpt)\b/],
  ['aws-devops', /\b(aws|gcp|azure|docker|kubernetes|devops|ci\/cd)\b/],
  ['zoho-salesforce', /\b(zoho|salesforce|hubspot)\b/],
  ['zapier-make-n8n', /\b(zapier|make\.com|n8n)\b/],
  ['tradingview-mt4-mt5', /\b(tradingview|metatrader|mt4|mt5)\b/],
  ['broker-exchange-api', /\b(broker api|exchange api|interactive brokers|alpaca|binance|coinbase|kraken)\b/],
  ['python-quant', /\b(python|pandas|numpy|backtest|quant)\b/],
];

const CONTEXT_RULES = [
  ['startup', /\bstartup\b/],
  ['agency', /\bagency\b/],
  ['ecommerce', /\b(e-?commerce|shopify|woocommerce|online store)\b/],
  ['internal-ops', /\b(internal|operations|workflow|admin|back office)\b/],
  ['creator-business', /\b(creator|influencer|course|coach|photographer|portfolio)\b/],
  ['local-business', /\b(local business|restaurant|salon|clinic|real estate agent)\b/],
  ['fintech-trading', /\b(trading|forex|broker|market data|fintech|crypto exchange)\b/],
  ['real-estate', /\b(real estate|property|realtor)\b/],
  ['healthcare', /\b(healthcare|medical|clinic|patient|doctor)\b/],
  ['education', /\b(education|learning|school|student|course|lms)\b/],
  ['marketing-sales', /\b(marketing|sales|lead|crm|appointment|seo|ads)\b/],
  ['marketplace', /\bmarketplace\b/],
];

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

function textFor(job) {
  const skills = job.skills?.map((skill) => `${skill.name} ${skill.prettyName}`).join(' ') ?? '';
  const occupations = [
    job.subcategory,
    job.occupations?.category?.prefLabel,
    ...(job.occupations?.subCategories?.map((item) => item.prefLabel) ?? []),
    job.occupations?.occupationService?.prefLabel,
  ].filter(Boolean).join(' ');
  return normalize(`${job.title ?? ''} ${job.description ?? ''} ${skills} ${occupations}`);
}

function contentTextFor(job) {
  return normalize(`${job.title ?? ''} ${job.description ?? ''}`);
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function isTestingOnlyJob(text) {
  const titleAndOpening = text.slice(0, 700);
  return [
    /\bqa\b/,
    /\bquality assurance\b/,
    /\bsoftware tester\b/,
    /\bmanual tester\b/,
    /\bqa tester\b/,
    /\btesters?\b/,
    /\btesting of\b/,
    /\bclosed testing\b/,
    /\btest plan\b/,
    /\bbug report\b/,
    /\busability testing\b/,
    /\bsecurity review\b/,
    /\bvalidate\b.*\bmarketplace\b/,
  ].some((pattern) => pattern.test(titleAndOpening))
    && !/\b(genetic testing|testing business|testing lab|split testing|a\/b testing)\b/.test(titleAndOpening);
}

function isAutomationPrimaryJob(text) {
  const titleAndOpening = text.slice(0, 900);
  return [
    /\bzapier\b/,
    /\bmake\.com\b/,
    /\bn8n\b/,
    /\bapi automation specialist\b/,
    /\bapi sync\b/,
    /\bwebhook flow\b/,
    /\bworkflow automation\b/,
    /\bbusiness process automation\b/,
    /\bautomate (?:manual|repetitive|tasks|process|workflow|emails?|notifications?|lead)/,
    /\blead routing\b/,
    /\bdocument parsing\b/,
    /\bspreadsheet-to-system\b/,
    /\bgoogle sheets automation\b/,
  ].some((pattern) => pattern.test(titleAndOpening));
}

function isWebDesignPrimaryJob(text) {
  const titleAndOpening = text.slice(0, 900);
  return [
    /\bfigma\b/,
    /\bui\/ux\b/,
    /\bux\/ui\b/,
    /\bmock-?up\b/,
    /\bwireframe\b/,
    /\bprototype\b/,
    /\bhomepage concept\b/,
    /\btheme design\b/,
    /\bstyle guide\b/,
    /\bmood board\b/,
    /\bbrand identity\b/,
    /\bvisual redesign\b/,
    /\bdesigner\b/,
  ].some((pattern) => pattern.test(titleAndOpening))
    && !/\b(full stack|backend|api|database|auth|login|dashboard|portal|marketplace|build and develop|develop(?:er|ment)?|implement|code|coding)\b/.test(titleAndOpening);
}

function isConversionPrimaryJob(text) {
  const titleAndOpening = text.slice(0, 1200);
  const hasOptimizationSignal = [
    /\bseo\b/,
    /\bcro\b/,
    /\bconversion(?: rate)? optimization\b/,
    /\bincrease (?:sales|leads|conversions|traffic)\b/,
    /\bsales funnel\b/,
    /\btechnical seo\b/,
    /\bgoogle analytics\b/,
    /\btracking setup\b/,
    /\bad pixel\b/,
    /\bmeta pixel\b/,
    /\bspeed optimization\b/,
    /\bpage speed\b/,
  ].some((pattern) => pattern.test(titleAndOpening));
  const hasWebSalesContext = /\b(website|web site|landing page|shopify|woocommerce|store|e-?commerce|funnel|checkout|product page|wordpress|webflow|wix|squarespace)\b/.test(titleAndOpening);
  return hasOptimizationSignal
    && hasWebSalesContext
    && !/\b(build|develop|full stack|backend|saas|dashboard|portal|marketplace)\b/.test(titleAndOpening);
}

function isEcommerceStorefrontPrimaryJob(text) {
  const titleAndOpening = text.slice(0, 1200);
  const hasStorefrontSignal = [
    /\bshopify\b/,
    /\bwoocommerce\b/,
    /\bmagento\b/,
    /\bbigcommerce\b/,
    /\bonline store\b/,
    /\bstorefront\b/,
    /\bproduct upload\b/,
    /\bproduct listing\b/,
    /\btheme tweak\b/,
    /\bstore setup\b/,
  ].some((pattern) => pattern.test(titleAndOpening));
  const isPlainWordPress = /\bwordpress\b/.test(titleAndOpening)
    && !/\b(woocommerce|shopify|magento|bigcommerce)\b/.test(titleAndOpening);
  return hasStorefrontSignal
    && !isPlainWordPress
    && !/\b(custom|full stack|backend|api|database|saas|marketplace|portal|app|headless|laravel|react|next\.?js)\b/.test(titleAndOpening);
}

function classifyPrimary(text) {
  const rule = RULES.find((candidate) => {
    if (candidate.tag === 'qa-testing-review') return isTestingOnlyJob(text);
    if (candidate.tag === 'automation-integration') return isAutomationPrimaryJob(text);
    if (candidate.tag === 'web-design') return isWebDesignPrimaryJob(text);
    if (candidate.tag === 'conversion-seo-sales') return isConversionPrimaryJob(text);
    if (candidate.tag === 'ecommerce-storefront') return isEcommerceStorefrontPrimaryJob(text);
    return matchesAny(text, candidate.patterns);
  });
  return rule ?? {
    tag: 'web-app-development',
    rationale: 'The posting is in software development and most closely resembles a custom web product or application request.',
  };
}

function inferIntent(text, primaryTag) {
  if (/\b(redesign|re-?design|revamp|moderni[sz]e|refresh)\b/.test(text)) return 'redesign';
  if (/\b(fix|bug|debug|issue|error|broken|troubleshoot|repair)\b/.test(text)) return 'fix';
  if (/\b(optimi[sz]e|performance|speed|conversion|seo)\b/.test(text)) return 'optimize';
  if (/\b(migrat|move from|upgrade)\b/.test(text)) return 'migrate';
  if (/\b(audit|review|assess|evaluate)\b/.test(text)) return 'audit';
  if (/\b(maintain|maintenance|support|ongoing)\b/.test(text)) return 'maintain';
  if (/\b(consult|advice|advisor|strategy|architect)\b/.test(text)) return 'consult';
  if (/\b(add|integrat|extend|enhance|improve|update|customi[sz]e)\b/.test(text)) return 'extend';
  if (primaryTag === 'qa-testing-review') return 'audit';
  return 'build';
}

function inferStack(text) {
  return STACK_RULES.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag).slice(0, 6);
}

function inferContext(text, primaryTag) {
  const contexts = CONTEXT_RULES.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
  if (primaryTag === 'trading-software' && !contexts.includes('fintech-trading')) contexts.unshift('fintech-trading');
  if (primaryTag === 'ecommerce-storefront' && !contexts.includes('ecommerce')) contexts.unshift('ecommerce');
  return [...new Set(contexts)].slice(0, 4);
}

function inferSecondary(primaryTag, text) {
  return RULES
    .filter((rule) => rule.tag !== primaryTag && matchesAny(text, rule.patterns))
    .map((rule) => rule.tag)
    .slice(0, 3);
}

function inferConfidence(text, stack, businessContext) {
  const matchedRuleCount = RULES.filter((rule) => matchesAny(text, rule.patterns)).length;
  if (matchedRuleCount >= 2 || stack.length >= 2 || businessContext.length >= 1) return 'high';
  if (matchedRuleCount === 1 || stack.length === 1) return 'medium';
  return 'low';
}

function parseJsonl(content, inputPath) {
  return content.trimEnd().split('\n').map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${inputPath}:${index + 1} is not valid JSON: ${error.message}`);
    }
  });
}

function validate(record) {
  if (!record.id) throw new Error('classification missing id');
  if (!PRIMARY_TAGS.has(record.primary_tag)) throw new Error(`${record.id}: invalid primary_tag ${record.primary_tag}`);
  if (!Array.isArray(record.secondary_tags) || record.secondary_tags.length > 3) throw new Error(`${record.id}: invalid secondary_tags`);
  for (const tag of record.secondary_tags) {
    if (!PRIMARY_TAGS.has(tag) || tag === record.primary_tag) throw new Error(`${record.id}: invalid secondary tag ${tag}`);
  }
  if (!INTENTS.has(record.intent)) throw new Error(`${record.id}: invalid intent ${record.intent}`);
  if (!Array.isArray(record.stack)) throw new Error(`${record.id}: stack must be an array`);
  if (!Array.isArray(record.business_context)) throw new Error(`${record.id}: business_context must be an array`);
  if (!CONFIDENCES.has(record.confidence)) throw new Error(`${record.id}: invalid confidence ${record.confidence}`);
  if (!record.rationale || record.rationale.length > 220) throw new Error(`${record.id}: invalid rationale`);
}

export function classify(job) {
  const text = textFor(job);
  const primary = classifyPrimary(contentTextFor(job));
  const stack = inferStack(text);
  const businessContext = inferContext(text, primary.tag);
  const record = {
    id: job.id,
    primary_tag: primary.tag,
    secondary_tags: inferSecondary(primary.tag, text),
    intent: inferIntent(text, primary.tag),
    stack,
    business_context: businessContext,
    confidence: inferConfidence(text, stack, businessContext),
    rationale: primary.rationale,
  };
  validate(record);
  return record;
}

function summarize(classifications, inputPath, outputPath) {
  const primaryTagCounts = Object.fromEntries([...PRIMARY_TAGS].map((tag) => [tag, 0]));
  const intentCounts = Object.fromEntries([...INTENTS].map((intent) => [intent, 0]));
  const confidenceCounts = Object.fromEntries([...CONFIDENCES].map((confidence) => [confidence, 0]));
  for (const classification of classifications) {
    primaryTagCounts[classification.primary_tag] += 1;
    intentCounts[classification.intent] += 1;
    confidenceCounts[classification.confidence] += 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    guidePath: resolve('docs/classification-guide.md'),
    inputPath,
    outputPath,
    classified: classifications.length,
    primaryTagCounts,
    intentCounts,
    confidenceCounts,
  };
}

async function main() {
  const inputPath = resolve(process.argv[2] ?? 'data/latest-software-dev-1000.jsonl');
  const outputPath = resolve(process.argv[3] ?? 'data/latest-software-dev-1000.classifications.jsonl');
  const summaryPath = outputPath.toLowerCase().endsWith('.jsonl')
    ? outputPath.replace(/\.jsonl$/i, '.summary.json')
    : `${outputPath}.summary.json`;

  const jobs = parseJsonl(await readFile(inputPath, 'utf8'), inputPath);
  const ids = new Set(jobs.map((job) => job.id));
  if (jobs.length !== ids.size) {
    throw new Error(`input contains duplicate job ids: ${jobs.length - ids.size}`);
  }

  const classifications = jobs.map(classify);
  if (classifications.length !== jobs.length) {
    throw new Error(`classified ${classifications.length} jobs from ${jobs.length} input jobs`);
  }

  const summary = summarize(classifications, inputPath, outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${classifications.map((item) => JSON.stringify(item)).join('\n')}\n`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`Classified ${classifications.length} jobs`);
  console.log(`Wrote ${outputPath}`);
  console.log(`Wrote ${summaryPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Failed:', error.message);
    process.exit(1);
  });
}
