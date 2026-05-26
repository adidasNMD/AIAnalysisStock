# Opportunity System Redesign Plan

## 1. Purpose

This document turns the current repo evidence and the user's `3 / 4 / 5` trading framework into a concrete product and technical redesign plan.

The trading framework is:

- `3`: IPO / spin-off / new pure-play re-rating
- `4`: supply-chain bottleneck / relay-chain rotation
- `5`: policy / thematic / proxy / domestic-substitution narrative

These are not isolated playbooks. They form one transmission chain:

- `3` introduces a new tradable symbol.
- `5` gives that symbol identity, emotion, and market-facing narrative.
- `4` transfers heat from the leader into bottlenecks and laggards where asymmetry is higher.

The redesign goal is not to replace the current mission platform.

The redesign goal is to preserve the current app as an analysis execution and evidence platform, while adding a higher-order opportunity layer that models the market transmission chain directly.

## 2. What Changed So Far

The branch already completed a large mission-lifecycle hardening pass:

- Real mission IDs are created before queueing.
- `mission_runs` were introduced as explicit execution instances.
- Mission cancellation, retry, heartbeat, and requeue are tracked at run level.
- Evidence snapshots are stored per run.
- Traces are stored per run.
- Mission compare is available at run level.
- Mission list items now expose `latestRun` and `latestDiff`.

The branch has also started the opportunity overlay:

- `opportunities` and `opportunity_events` are now persisted in SQLite.
- The root page is now an opportunity workbench, while the old command center remains available as the execution console.
- Structured opportunity events are streamed separately from mission logs.
- `3 / 4 / 5` opportunity cards can now be created directly from the UI.
- Relay-chain snapshots can be seeded from the dynamic watchlist.
- IPO / spin-off opportunities now support a structured calendar profile.
- Opportunity snapshots and thesis-level diffs now exist in parallel with mission/run-level diffs.
- `T2 / EDGAR` can now auto-sync `New Code Radar` opportunity cards from filing progression.
- Dynamic watchlist data can now be auto-assembled into `Heat Transfer Graph` relay opportunities.

Relevant repo evidence:

- Mission creation and queueing: [src/workflows/mission-submission.ts](/Users/sineige/Desktop/AIAnalysisStock/src/workflows/mission-submission.ts:69)
- Worker execution chain: [src/worker.ts](/Users/sineige/Desktop/AIAnalysisStock/src/worker.ts:141)
- Dispatch / enrichment / consensus: [src/workflows/dispatch-engine.ts](/Users/sineige/Desktop/AIAnalysisStock/src/workflows/dispatch-engine.ts:157)
- Mission diff summary: [src/workflows/mission-diff.ts](/Users/sineige/Desktop/AIAnalysisStock/src/workflows/mission-diff.ts:47)
- Mission list API: [src/server/app.ts](/Users/sineige/Desktop/AIAnalysisStock/src/server/app.ts:686)
- Current homepage: [dashboard/src/pages/CommandCenter.tsx](/Users/sineige/Desktop/AIAnalysisStock/dashboard/src/pages/CommandCenter.tsx:35)
- Opportunity workbench: [dashboard/src/pages/OpportunityWorkbench.tsx](/Users/sineige/Desktop/AIAnalysisStock/dashboard/src/pages/OpportunityWorkbench.tsx:1)
- Opportunity persistence and lifecycle: [src/workflows/opportunities.ts](/Users/sineige/Desktop/AIAnalysisStock/src/workflows/opportunities.ts:1)
- Opportunity diff: [src/workflows/opportunity-diff.ts](/Users/sineige/Desktop/AIAnalysisStock/src/workflows/opportunity-diff.ts:1)
- Opportunity automation: [src/workflows/opportunity-automation.ts](/Users/sineige/Desktop/AIAnalysisStock/src/workflows/opportunity-automation.ts:1)

## 3. Current Operating Mechanism

The current app works well as an execution-and-evidence platform.

### 3.1 Ingestion

The daemon uses four triggers:

- T1 price/volume sentinel
- T2 RSS / EDGAR scans
- T3 scheduled daily report
- T4 TrendRadar trend scan

Repo evidence:

- [src/worker.ts](/Users/sineige/Desktop/AIAnalysisStock/src/worker.ts:122)

### 3.2 Discovery

Discovery today comes from:

- TrendRadar text-first multi-source trend analysis
- EDGAR IPO filing scans
- Dynamic watchlist promotion logic

Repo evidence:

- TrendRadar: [src/agents/trend/trend-radar.ts](/Users/sineige/Desktop/AIAnalysisStock/src/agents/trend/trend-radar.ts:75)
- IPO filing scan: [src/tools/edgar-monitor.ts](/Users/sineige/Desktop/AIAnalysisStock/src/tools/edgar-monitor.ts:136)
- Dynamic watchlist: [src/utils/dynamic-watchlist.ts](/Users/sineige/Desktop/AIAnalysisStock/src/utils/dynamic-watchlist.ts:65)

### 3.3 Execution

Every analysis request becomes a `mission`, then a queued task, then a `mission_run`.

Repo evidence:

- Queue model: [src/utils/task-queue.ts](/Users/sineige/Desktop/AIAnalysisStock/src/utils/task-queue.ts:42)
- Mission submission: [src/workflows/mission-submission.ts](/Users/sineige/Desktop/AIAnalysisStock/src/workflows/mission-submission.ts:34)
- Mission run tracking: [src/workflows/mission-runs.ts](/Users/sineige/Desktop/AIAnalysisStock/src/workflows/mission-runs.ts:83)

### 3.4 Analysis

`dispatchMission` runs:

- OpenClaw exploration
- TA enrichment
- OpenBB enrichment
- consensus synthesis
- anti-sell guard
- alerts
- evidence save

Repo evidence:

- [src/workflows/dispatch-engine.ts](/Users/sineige/Desktop/AIAnalysisStock/src/workflows/dispatch-engine.ts:185)

### 3.5 Presentation

The frontend currently consumes:

- `/api/missions` summaries
- mission details / runs / evidence / trace
- SSE logs from `/api/missions/stream`
- polling for queue, diagnostics, and mission lists

Repo evidence:

- Mission API: [src/server/app.ts](/Users/sineige/Desktop/AIAnalysisStock/src/server/app.ts:686)
- Polling and SSE: [dashboard/src/hooks/useAgentStream.ts](/Users/sineige/Desktop/AIAnalysisStock/dashboard/src/hooks/useAgentStream.ts:16)

## 4. Mapping the Current System to 3 / 4 / 5

### 4.1 `3` New code radar

Current support: partial.

What exists:

- EDGAR filing monitoring
- manual mission submission
- run-level evidence persistence

What is missing:

- actual trading calendar object
- split / spin-off supply-overhang tracking
- lockup / greenshoe / retained-stake tracking
- first independent earnings and first-initiation milestones

Conclusion:

The current system can detect some inputs for `3`, but it does not model the lifecycle that makes `3` tradeable.

Latest branch progress:

- Filing progression is now converted into automatic radar candidates and opportunity cards.
- The current implementation is still filing-stage aware, not exchange-calendar aware.
- The next upgrade should focus on true trading-date and supply-overhang precision.

### 4.2 `4` Heat transfer / bottleneck relay

Current support: strongest.

What exists:

- dynamic watchlist with `sector_leader / bottleneck / hidden_gem`
- mission compare and consensus tracking
- lifecycle engine using leader health for anti-sell guard

Repo evidence:

- [src/utils/dynamic-watchlist.ts](/Users/sineige/Desktop/AIAnalysisStock/src/utils/dynamic-watchlist.ts:17)
- [src/agents/lifecycle/engine.ts](/Users/sineige/Desktop/AIAnalysisStock/src/agents/lifecycle/engine.ts:37)

What is missing:

- explicit transmission graph
- leader temperature object
- relay validation history
- laggard ranking based on transmission probability

Conclusion:

The repo already contains the seeds of `4`, but not the graph model that turns it into a real decision system.

Latest branch progress:

- Heat-transfer graphs are now built automatically from the dynamic watchlist.
- Those graphs can now auto-sync into relay opportunities.
- The next upgrade should focus on edge weights, validation history, and breadth decay.

### 4.3 `5` Proxy / policy / mapping narrative

Current support: weakest.

What exists:

- TrendRadar topic scanning
- generic narrative memory

What is missing:

- proxy symbol model
- purity / scarcity / legitimacy scoring
- rule-state transitions that affect tradability
- explicit mapping between private leaders and public proxies

Conclusion:

The system can "see themes" but cannot yet operate like a disciplined proxy-symbol desk.

## 5. Core Problems

### 5.1 The system only has an execution-layer primary object

`mission` is not the problem. It is the right object for execution, retry, evidence, trace, and audit.

The problem is that the system currently has no higher-order `opportunity` object above `mission`.

So the redesign should add an opportunity layer, not replace the mission layer.

### 5.2 Discovery loses structure too early

TrendRadar currently produces free-form text and extracts tickers later:

- [src/agents/trend/trend-radar.ts](/Users/sineige/Desktop/AIAnalysisStock/src/agents/trend/trend-radar.ts:131)

This means catalyst class, opportunity stage, and transmission logic are not stable data.

### 5.3 Storage is split across incompatible shapes

- missions in JSON files
- queue and runs in SQLite
- dynamic watchlist in JSON
- narrative memory in SQLite

This works operationally, but makes opportunity-centric ranking and UI difficult.

### 5.4 Homepage IA only exposes the operator view

The current root page is a control room:

- health cards
- mission launcher
- task queue
- logs

That control room should be preserved.

What is missing is a trader-first workspace organized around:

- new codes
- relay chains
- proxies

### 5.5 Event flow is mostly mission logs plus polling

The app has strong mission logging.

What it lacks is a second, structured opportunity event flow.

The system needs domain events such as:

- opportunity created
- catalyst added
- leader confirmed
- relay ignited
- proxy strengthened
- thesis degraded

## 6. Three Redesign Paths

The user explicitly asked for more than one path. Here are the real options.

### Path A: Opportunity-first replacement

Description:

- Replace the mental center of the app with `Opportunity`.
- Missions become secondary implementation details.
- Homepage becomes an opportunity board.

Pros:

- Best match for `3 / 4 / 5`
- Best long-term UX
- Best path for ranking and alerts

Cons:

- Risks under-valuing the existing execution platform
- Largest conceptual shift
- Requires more schema and UI work

### Path B: Narrative-first overlay

Description:

- Keep missions as primary.
- Upgrade `narratives` into the main market lens.
- Use narrative stage as the organizing UI principle.

Pros:

- Reuses existing narrative engine
- Lower migration cost

Cons:

- Weak for IPO calendar and supply events
- Weak for proxy scoring and symbol-level workflow

### Path C: Execution-first incremental path

Description:

- Keep current mission-centered product.
- Add better tagging, better filters, better summaries.

Pros:

- Fastest to ship
- Lowest risk

Cons:

- Solves symptoms, not structure
- Will likely drift back into generic task-console behavior

### Path D: Layered overlay

Description:

- Preserve the current mission/run/evidence/trace platform as the execution core.
- Add `Opportunity` above it as a market-structure object.
- Let opportunities create, link, and interpret missions without replacing them.

Pros:

- Best fit for the user's clarified intent
- Protects the hardened execution chain
- Allows homepage and event redesign without destabilizing the core

Cons:

- Requires discipline to keep the two layers conceptually clean
- Some duplication in UI and API summaries is inevitable

### Recommendation

Use Path D as the product architecture.

Within Path D:

- borrow Path B's narrative-stage semantics
- use Path C's incremental migration style
- avoid Path A's replacement framing

## 7. Target Product Model

### 7.1 Core objects

#### Opportunity

Persistent, trader-facing object layered above the execution core.

Key fields:

- `type`: `ipo_spinout | relay_chain | proxy_narrative | ad_hoc`
- `stage`: `radar | framing | tracking | ready | active | cooldown | archived`
- `status`: `watching | ready | active | degraded | archived`
- `query`
- `title`
- `thesis`
- `primaryTicker`
- `leaderTicker`
- `proxyTicker`
- `relatedTickers`
- `nextCatalyst`
- `scores`

#### Mission

Execution container for a single analysis request.

Missions remain first-class in the execution layer and are attached to opportunities only when relevant.

#### MissionRun

Operational attempt / retry / lease / heartbeat object.

#### OpportunityEvent

Structured event emitted when an opportunity changes in a way the UI should care about.

## 8. Target Homepage IA

The homepage should become an opportunity workbench with four zones:

### Zone 1: Quick-create templates

- `3` New Code Radar
- `4` Heat Transfer Map
- `5` Proxy Symbol Desk

### Zone 2: Three opportunity boards

- `3` board: new listings, spin-offs, catalysts, supply calendar
- `4` board: leader, bottleneck, laggard, heat state
- `5` board: proxy candidates, policy legitimacy, scarcity, rule-state changes

### Zone 3: Structured signal tape

Live opportunity events, not just agent logs.

### Zone 4: Execution drill-down

Recent mission / run state for debugging and deep inspection.

This zone exists specifically to preserve the current platform's value instead of hiding it.

## 9. Target Event Flow

Structured events should include at least:

- `created`
- `mission_linked`
- `mission_queued`
- `mission_completed`
- `mission_failed`
- `mission_canceled`
- `signal_changed`
- `thesis_upgraded`
- `thesis_degraded`

These events should be:

- persisted
- queryable
- streamable over SSE
- consumable by the homepage without parsing generic logs

## 10. Implementation Sequence

### Step 1: Opportunity model

- add opportunity types to workflow types
- add `opportunities` and `opportunity_events`
- allow missions to link to opportunities
- expose `/api/opportunities`
- keep existing mission APIs and routes unchanged as the execution substrate

### Step 2: Homepage IA

- replace root page with opportunity workbench
- move old command center to a secondary route, not remove it
- add three quick-create templates
- show boards grouped by opportunity type

### Step 3: Structured event flow

- persist opportunity events
- stream them via SSE
- render a structured signal tape in the homepage
- keep the existing agent log SSE as a separate lower-level stream

## 11. Risks

- Opportunity auto-creation for every daemon task would flood the system.
- The old JSON mission store still limits some ranking and joins.
- Heuristic type inference should be conservative; explicit creation is safer than over-guessing.

## 12. Immediate Build Scope

This implementation pass will do:

- introduce a minimum viable opportunity domain model
- connect it to manual mission creation
- ship an opportunity-centric homepage
- add structured opportunity SSE

It will not yet do:

- full IPO calendar ingestion
- complete relay-chain graph modeling
- full proxy-symbol rule engine

Those should follow in the next phase once the opportunity shell is in production.
