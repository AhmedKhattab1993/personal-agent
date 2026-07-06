# Market Circuit YouTube Long-Form Video Generation Flow

## Purpose

Market Circuit needs a repeatable video generation flow for long-form YouTube market-intelligence episodes. Each episode should turn current stock-market news into an 8-20 minute, high-retention video using reusable Market Circuit assets, web-researched source material, and HyperFrames for final video assembly.

This flow is the Market Circuit version of a brand-level system. The same structure can later be copied for other brands, but the reusable assets, visual identity, tone, and topic filters must be brand-specific.

## Target Format

- Platform: YouTube long-form.
- Runtime: 8-20 minutes.
- Topic area: stock-market news, public companies, market catalysts, earnings, guidance, macro-sensitive themes, and watchlist-worthy moves.
- Viewer promise: explain why a market story matters, what changed, what evidence supports it, what risks remain, and what a rational viewer should keep watching.
- Output style: fast-moving market desk, not generic finance slideshow.
- Compliance posture: educational market commentary only, with no personalized financial advice.

## Required Inputs

1. Reusable Market Circuit brand assets.
2. Latest stock-news research from web search and source review.
3. Episode thesis, hook, script, source ledger, and visual plan.
4. HyperFrames project files for the final long-form video.
5. Rendered video plus QC evidence.

## Flow Overview

### 1. Brand Asset Pack

This is the first gate. Do not produce an episode until the reusable Market Circuit asset pack exists and is accepted.

The asset pack should include:

- Logo variants: transparent mark, dark square mark, glow square mark, and wordmark banner.
- Visual identity spec: exact colors, typography, chart styling, spacing, lower-third style, data-table style, and thumbnail-safe contrast rules.
- Motion identity: intro sting, chapter bumper, transition language, kinetic text style, chart reveal style, and closing motion.
- Audio identity: music bed direction, sting timing, voiceover tone, loudness target, and any reusable disclaimers.
- Video templates: cold open, title card, story setup, source card, chart segment, quote card, risk-counterpoint card, watchlist card, and end screen.
- Editorial components: recurring segment names, disclaimer copy, source-citation format, ticker treatment, and market-data timestamp treatment.
- Asset manifest: filename, purpose, dimensions, source, allowed usage, and replacement owner.

The current Market Circuit base assets live in `brands/Marketcircuit/`. The next preparation step is to turn those files into a production-ready video kit.

### 2. Current News Discovery

Each episode begins with a fresh news sweep. The research pass should use web search to find current, interesting stock stories and then filter them for narrative strength.

Prioritize stories with:

- A clear catalyst: earnings, guidance, regulatory event, product launch, M&A, analyst shift, macro shock, legal development, or unusual market reaction.
- A visible market question: why did the stock move, why did the market miss it, what could change next?
- Strong source support: company filings, investor relations releases, earnings transcripts, exchange data, reputable financial news, and analyst context where allowed.
- Visual potential: charts, before-after numbers, timeline, segment breakdown, peer comparison, or decision tree.
- Viewer relevance: big-cap names, emerging breakouts, controversial narratives, or undercovered moves with broad market implications.

Reject stories when the only hook is price movement without a credible catalyst, thin sourcing, stale news, or a thesis that depends on unsupported prediction.

### 3. Editorial Packaging

For every candidate story, produce a short editorial brief:

- Main question: the open loop that keeps viewers watching.
- Hook: the first 15-30 seconds.
- Stakes: why this matters now.
- Evidence spine: 3-5 source-backed facts.
- Counterpoint: what could make the thesis wrong.
- Visual spine: charts, quote cards, timelines, source cards, and comparison scenes.
- Viewer payoff: what the viewer understands by the end that they did not understand at the start.

The selected story should have a stronger narrative than "stock went up" or "stock went down." It needs tension, evidence, and a clean payoff.

### 4. Script Structure

Use a retention-first structure:

- Cold open: pattern interrupt, surprising stat, or contradiction.
- Promise: what the viewer will understand by the end.
- Context reset: the minimum background needed to follow the story.
- Catalyst: what happened and when.
- Evidence run: 3-5 source-backed proof points.
- Market reaction: price action, volume, peers, sector context, and sentiment.
- Counterargument: what the market may be pricing correctly or incorrectly.
- Watchlist: concrete signals to monitor next.
- Payoff: answer the original question.
- Close: concise educational disclaimer and next episode bridge.

Avoid long channel intros before the promise. Open loops should be introduced early and paid off deliberately.

### 5. HyperFrames Production

HyperFrames should be used as the video assembly system. Before creating composition HTML, the project must have a visual identity file that defines colors, fonts, motion rules, and brand constraints.

Production expectations:

- Build 16:9 compositions for YouTube long-form.
- Use a Market Circuit `DESIGN.md` or equivalent visual identity file as the source of truth.
- Use deterministic animation only.
- Use timed scenes with explicit durations and transitions between scenes.
- Keep video and audio tracks separate.
- Include source cards where claims need attribution.
- Use data-driven visuals for charts, tickers, comparisons, and timelines.
- Render captions or on-screen emphasis for important claims and numbers.
- Validate with HyperFrames lint, validation, inspection, and render checks before delivery.

The result should feel like a premium market-analysis episode, not a deck recording.

### 6. Retention Patterns

Use long-form YouTube patterns intentionally:

- Start with the most interesting contradiction, not the background.
- Make the title, thumbnail, and first minute answer the same curiosity gap.
- Re-open curiosity every 60-90 seconds with a new question, reveal, or risk.
- Use visual pattern changes every 20-45 seconds: chart, quote, timeline, ticker wall, source card, host-style narration beat, or data comparison.
- Place payoff moments after enough evidence, not immediately after the hook.
- Use plain-language transitions so viewers know why the next segment matters.
- Avoid filler disclaimers, generic market definitions, and long static charts.
- End with a clean answer and a forward-looking watchlist, not vague optimism.

### 7. Verification Gates

An episode is not complete until these gates pass:

- Brand gate: all visuals trace back to the approved Market Circuit asset pack.
- Research gate: every factual claim has a source and publication date.
- Editorial gate: hook, thesis, counterpoint, and payoff are explicit.
- Compliance gate: no personalized financial advice or unsupported prediction.
- HyperFrames gate: lint, validation, layout inspection, and render checks pass.
- YouTube gate: title, thumbnail concept, description, chapters, and source notes are ready.

## First Step: Prepare the Reusable Asset Pack

Start with the reusable assets because every later step depends on them. Without a locked asset pack, each episode will reinvent the brand, slow down production, and risk inconsistent visuals.

### Asset Pack Sprint

Create `brands/Marketcircuit/video-kit/` with:

- `DESIGN.md`: colors, typography, motion rules, chart rules, source-card rules, and what not to do.
- `asset-manifest.md`: every reusable file, its purpose, dimensions, and approved usage.
- `templates/`: reusable HyperFrames scene templates for intro, title card, chapter bumper, chart, source card, quote card, risk card, watchlist, and end screen.
- `audio/`: music-bed notes, sting references, voiceover settings, and loudness target.
- `editorial/`: hook formulas, episode brief template, source ledger template, disclaimer copy, and YouTube metadata template.

### Done Criteria

The reusable asset pack is ready when:

- Market Circuit colors, fonts, chart styling, and motion language are documented.
- Existing logo files are mapped to exact video uses.
- Every reusable scene has a named purpose and required inputs.
- The first HyperFrames visual identity gate can pass without asking brand questions.
- A new episode can begin from a brief and source ledger instead of from a blank page.

The shortest high-quality path is to prepare `DESIGN.md` and `asset-manifest.md` first, then create only the scene templates needed for the first pilot episode.
