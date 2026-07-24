export const LANES = [
  {
    id: 'trading',
    label: 'Market Circuit',
    description: 'Trading-related market intelligence, broker APIs, dashboards, backtesting, and execution tools.',
    avoidedExpectation: 'AI will make profitable trades.',
  },
  {
    id: 'ai-agents',
    label: 'Work Circuit',
    description: 'AI-related jobs, products, agents, LLM workflows, copilots, RAG, and video work.',
    avoidedExpectation: 'AI will generate trading returns.',
  },
  {
    id: 'automation',
    label: 'Automation',
    description: 'API integrations, data pipelines, alerts, reports, business process automation.',
    avoidedExpectation: 'Magic AI outcome.',
  },
];

const LANE_RULES = {
  trading: [
    ['broker API', /\bbroker api\b/],
    ['exchange API', /\bexchange api\b/],
    ['market data', /\bmarket data\b/],
    ['backtesting', /\bback[- ]?test(?:er|ing)?\b/],
    ['execution', /\bexecution (?:dashboard|tool|system|engine|workflow)\b/],
    ['TradingView', /\btradingview\b/],
    ['Pine Script', /\bpine ?script\b/],
    ['MetaTrader', /\bmetatrader\b|\bmt4\b|\bmt5\b/],
    ['NinjaTrader', /\bninjatrader\b/],
    ['Interactive Brokers', /\binteractive brokers\b|\bibkr\b/],
    ['Alpaca', /\balpaca\b/],
    ['Binance API', /\bbinance(?: api)?\b/],
    ['trading bot', /\btrading bot\b|\btrade bot\b/],
    ['scanner', /\b(?:trading|stock|crypto|forex) scanner\b/],
    ['forex', /\bforex\b/],
    ['portfolio risk', /\bportfolio\b.*\brisk\b|\brisk\b.*\bportfolio\b/],
  ],
  'ai-agents': [
    ['AI agent', /\bai agent\b|\bagentic\b/],
    ['AI workflow', /\bai workflow\b/],
    ['chatbot', /\bchatbot\b|\bai chatbot\b/],
    ['OpenAI', /\bopenai\b|\bchatgpt\b|\bgpt-?4\b|\bgpt-?5\b/],
    ['Claude', /\bclaude\b|\banthropic\b/],
    ['LangChain', /\blangchain\b/],
    ['RAG', /\brag\b|\bretrieval augmented generation\b/],
    ['research agent', /\bresearch agent\b/],
    ['reporting agent', /\breporting agent\b/],
    ['CRM agent', /\bcrm agent\b/],
    ['ecommerce AI', /\becommerce ai\b|\be-?commerce ai\b/],
    ['internal copilot', /\binternal copilot\b|\bcopilot\b/],
    ['customer support AI', /\bcustomer support ai\b|\bai support\b/],
    ['LLM', /\bllm\b|\blarge language model\b/],
  ],
  automation: [
    ['API integration', /\bapi integration\b|\bintegrate .* api\b|\bapi sync\b/],
    ['workflow automation', /\bworkflow automation\b/],
    ['business process automation', /\bbusiness process automation\b/],
    ['data pipeline', /\bdata pipeline\b|\betl\b/],
    ['report automation', /\breport automation\b|\bautomated report\b/],
    ['alert automation', /\balert automation\b|\bautomated alert\b/],
    ['Zapier', /\bzapier\b/],
    ['Make', /\bmake\.com\b/],
    ['n8n', /\bn8n\b/],
    ['Google Sheets automation', /\bgoogle sheets automation\b|\bgoogle sheets\b.*\bautomation\b/],
    ['Airtable automation', /\bairtable\b.*\bautomation\b|\bairtable integration\b/],
    ['Slack automation', /\bslack\b.*\bautomation\b|\bslack integration\b/],
    ['webhook', /\bwebhook\b/],
    ['document parsing', /\bdocument parsing\b|\bparse (?:pdf|document|invoice)s?\b/],
    ['spreadsheet automation', /\bspreadsheet(?:-to-system)? automation\b/],
  ],
};

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ');
}

export function jobContentText(job) {
  return normalize(`${job.title ?? ''} ${job.description ?? ''}`);
}

function findMatches(text, rules) {
  return rules
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
}

export function classifyLane(job) {
  const text = jobContentText(job);
  const laneMatches = {};

  for (const lane of LANES) {
    laneMatches[lane.id] = findMatches(text, LANE_RULES[lane.id]);
  }

  const ranked = LANES
    .map((lane) => ({
      lane,
      matches: laneMatches[lane.id],
      score: laneMatches[lane.id].length,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || LANES.findIndex((lane) => lane.id === a.lane.id) - LANES.findIndex((lane) => lane.id === b.lane.id));

  const primary = ranked[0] ?? null;
  return {
    lane: primary?.lane ?? null,
    laneId: primary?.lane.id ?? null,
    laneLabel: primary?.lane.label ?? null,
    matches: primary?.matches ?? [],
    matchedLanes: ranked.map((item) => ({
      id: item.lane.id,
      label: item.lane.label,
      matches: item.matches,
    })),
    relevant: ranked.length > 0,
  };
}
