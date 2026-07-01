# Upwork Job Classification Guide

Use this guide to classify fetched Upwork software-development jobs for trend
analysis. Read the full title and description before assigning labels. Do not
classify by keyword alone.

## Goal

Each job should receive:

- `primary_tag`: exactly one core market-demand category.
- `secondary_tags`: zero to three supporting tags.
- `intent`: the buyer's main action request.
- `stack`: notable technologies, platforms, or tools.
- `business_context`: the buyer's domain or operating context.
- `confidence`: `high`, `medium`, or `low`.

The primary tag should answer: what kind of buyer demand is this job really
expressing?

## Primary Tags

### `web-app-development`

Real web development work across websites, web apps, SaaS products, portals,
marketplaces, custom ecommerce, payment flows, and API-connected web products.

Typical examples: custom WordPress development, React/Next app, SaaS dashboard,
customer portal, marketplace, booking platform, custom Shopify app or checkout,
Laravel website, full-stack web build, payment-enabled web product.

### `web-design`

Design-only or mostly visual web work where implementation is not the main
request.

Typical examples: Figma mockup, UI/UX design, homepage concept, landing-page
design, theme design, brand style guide, website visual redesign.

### `conversion-seo-sales`

Optimization work where the main outcome is more traffic, leads, conversions,
sales, or measurable marketing performance.

Typical examples: SEO, CRO, conversion optimization, speed optimization,
technical SEO, analytics, ad pixels, tracking setup, landing-page optimization,
sales funnel improvement.

### `ecommerce-storefront`

Storefront and ecommerce platform setup/configuration where the main work is
not custom product engineering.

Typical examples: Shopify store setup, WooCommerce configuration, product
uploads, theme tweaks, app configuration, store admin setup, basic storefront
configuration.

### `mobile-app`

Native or cross-platform mobile products.

Typical examples: iOS, Android, Flutter, React Native, mobile MVP, app fixes,
app store work, mobile UX, mobile backend when the app is the main product.

### `ai-apps-agents`

AI products, AI agents, and AI features where AI is central to the buyer's
requested outcome.

Typical examples: AI agent, RAG system, chatbot product, AI SaaS, copilot,
LLM workflow engine, AI research or generation platform, add OpenAI to an app,
Claude integration, AI summary feature, AI support widget, prompt workflow
inside an existing product.

### `automation-integration`

Workflow automation and system glue where the main work is connecting tools or
moving information between systems.

Typical examples: Zapier, Make, n8n, API sync, notifications, webhook flows,
backend automation, spreadsheet-to-system automation.

### `crm-erp-business-systems`

Business operations platforms and internal operating systems.

Typical examples: Zoho, Salesforce, HubSpot, ERPNext, Odoo, Airtable, Notion,
inventory systems, invoice systems, business process configuration.

### `data-scraping-pipelines`

Data extraction, transformation, analytics, reporting, or dashboard pipelines.

Typical examples: scraping, ETL, data extraction, CSV or Excel processing,
analytics dashboard, BI automation, database cleanup, reporting pipeline.

### `backend-api-infrastructure`

Backend, API, database, cloud, deployment, or infrastructure work where the
frontend product category is not the main ask.

Typical examples: API build, auth, database schema, DevOps, AWS/GCP/Azure,
Docker, performance, deployment, backend service, server migration.

### `qa-testing-review`

Testing, review, and quality-assurance work.

Typical examples: manual QA, automation QA, test plans, mobile testing, web
testing, bug reports, security review, usability testing, performance testing.

### `trading-software`

Trading, brokerage, market-data, and quantitative trading systems. Use this tag
even when the stack is ordinary web, Python, Node, desktop, or automation. The
trading domain is the primary signal.

Typical examples: trading platform, broker API, exchange integration, market
data feed, charting, backtesting, execution bot, copy trading, portfolio/risk
tool, quant dashboard, MetaTrader, TradingView, NinjaTrader, Interactive
Brokers, Alpaca, Binance, Coinbase, FIX, order routing.

Use `trading-software` when the job is centered on:

- receiving, processing, or displaying financial market data;
- placing, routing, copying, or automating trades;
- building trading dashboards, indicators, scanners, or alerting tools;
- backtesting strategies or managing trading risk;
- integrating broker, exchange, or charting APIs.

Do not use `trading-software` for generic fintech, payment, accounting, or
crypto work unless the actual job is about trading or market execution.

### `blockchain-web3`

Blockchain systems that are not primarily trading software.

Typical examples: smart contracts, wallets, token systems, NFT, DeFi protocol,
crypto payments, blockchain integrations.

If the job is a crypto exchange trading bot or market execution tool, prefer
`trading-software`.

### `game-3d-interactive`

Games and interactive visual experiences.

Typical examples: Unity, Unreal, Cocos, game mechanics, 3D visualization,
AR/VR, simulations, interactive environments.

### `desktop-embedded-systems`

Local software, desktop products, firmware, hardware-adjacent systems, and
non-web application tooling.

Typical examples: desktop app, browser extension when product-like, firmware,
embedded software, hardware integration, local automation utility.

### `product-project-technical-management`

Technical product, project, and delivery-management roles.

Typical examples: product owner, technical PM, scrum master, roadmap,
requirements, specs, engineering coordination, delivery management.

## Secondary Dimensions

### Intent

Use one:

- `build`
- `redesign`
- `fix`
- `extend`
- `optimize`
- `migrate`
- `audit`
- `maintain`
- `consult`

### Stack

Use concise stack tags when clearly supported by the title or description.

Examples:

- `wordpress`
- `shopify`
- `webflow-wix`
- `react-next`
- `node-python`
- `php-laravel`
- `flutter-react-native`
- `ios-android`
- `openai-llm`
- `aws-devops`
- `zoho-salesforce`
- `zapier-make-n8n`
- `tradingview-mt4-mt5`
- `broker-exchange-api`
- `python-quant`

### Business Context

Use concise domain/context tags when clearly supported.

Examples:

- `startup`
- `agency`
- `ecommerce`
- `internal-ops`
- `creator-business`
- `local-business`
- `fintech-trading`
- `real-estate`
- `healthcare`
- `education`
- `marketing-sales`
- `marketplace`

## Tie-Breaking Rules

1. Choose the tag that best captures the buyer's business outcome, not the
   implementation stack.
2. If AI is central to the requested outcome, use `ai-apps-agents`, whether AI
   is the product or a feature added to another product.
3. If the job is design-only or mostly visual design, use `web-design`.
4. If the main outcome is SEO, CRO, speed, tracking, leads, or sales
   improvement, use `conversion-seo-sales`.
5. If ecommerce work is platform setup/configuration with little custom code,
   use `ecommerce-storefront`. If it is custom ecommerce development, use
   `web-app-development`.
6. If the job is an internal business platform built in Zoho, Salesforce, Odoo,
   ERPNext, or HubSpot, use `crm-erp-business-systems`.
7. If the job is trading-related, use `trading-software` even when it looks like
   a normal web app, desktop app, automation, or data pipeline.
8. If the job asks only for testing or review, use `qa-testing-review`.
9. If the job is mainly API, cloud, deployment, or backend work with no clearer
   product context, use `backend-api-infrastructure`.

## Output Shape

Use this schema for each classified job:

```json
{
  "id": "upwork_job_id",
  "primary_tag": "trading-software",
  "secondary_tags": ["automation-integration", "data-scraping-pipelines"],
  "intent": "build",
  "stack": ["broker-exchange-api", "python-quant"],
  "business_context": ["fintech-trading"],
  "confidence": "high",
  "rationale": "Short explanation based on the job title and description."
}
```

Keep `rationale` short. It should explain the classification decision, not
summarize the whole posting.
