# Implementation report: advanced engineering intelligence

What was added on top of the existing PREMORTEM, RECALL-X, memory and analytics features, what is genuinely functional, and what is not.

## Verified

| Check | How | Result |
|---|---|---|
| Strict TypeScript + production build | `npm run build` | passes |
| Every page, desktop 1440px | Playwright walk-through of all 22 routes | no console errors, no horizontal scroll |
| Every new page, phone 390px | Playwright | no horizontal scroll |
| Decision creation → premortem → progress note → outcome | Playwright + API | works; learning event appears |
| Incident creation → investigation → conflict panel → resolve | Playwright + API | works |
| Hindsight retain / recall / reflect code path | strict async fake that checks every method signature and that all calls share one event loop | 1 loop, all signatures valid |
| Hindsight failure | fake that raises on recall | request still succeeds, error is logged and shown |
| Live Hindsight Cloud + Groq | **not testable from the build environment** (network blocked) | run `python -m app.seed --reset` with your keys to confirm |

## New capabilities

| Feature | Status | Data source | Notes |
|---|---|---|---|
| **Decision DNA** (`/dna`) | Functional | Records | 8 patterns, each with supporting records, frequency, Beta confidence, half-year trend, recommendation and clickable evidence. A pattern with no data is shown as "Not enough data", never invented. |
| **What-If Simulator** (`/whatif`) | Functional | Records + Hindsight recall + Groq | Matches past decisions per option, separates evidence that mentions both options, recalls memories for each, and asks Groq for a structured comparison. Every result is labelled hypothetical. Without Groq, a rule-based comparison is shown and labelled. |
| **Risk Propagation** (`/propagation`) | Functional | Service catalogue + incidents + decisions | Three edge types, all labelled: *declared* (catalogue), *observed* (an incident that actually spread), *inferred* (services changed together). Zoom, pan, drag, node details, and "simulate a change" to show a decision's blast radius. |
| **Memory Conflict Detector** (`/conflicts`, and inside incidents) | Functional | Records + Hindsight recall + optional Groq | Finds fixes that resolved one incident but failed in another, and assumptions that held once and broke elsewhere. Shows both memories, a context-difference table, a computed explanation (replicas × pool vs DB connection limit), and a recommendation that doesn't pick a side blindly. |
| **Knowledge Retention** (`/knowledge`) | Functional | Records + service catalogue | Undocumented decisions, missing root causes, incidents only mitigated, missing runbooks, knowledge concentration (framed as continuity, not performance), contested lessons. Actions: open the record, copy a confirmation request, draft a runbook from the fix history (copy or download .md). |
| **Learning Engine** (`/learning`) | Functional | Records + memory-operation log | The 9-step loop with live counts, and a timeline of how each outcome moved each lesson's confidence. States plainly that the LLM is not retrained. Step 4 (implementation progress) is new: progress notes on open decisions are retained to Hindsight. |
| **Memory Scorecard** (`/scorecard`) | Functional | Records | 8 metrics, each with value, formula, trend, supporting records and a data-completeness bar. No improvement percentages are estimated. |

## Supporting changes

- **Hindsight reliability:** all Hindsight calls now run on one dedicated asyncio loop using the async client. The sync client breaks inside FastAPI (different loop per worker thread). Recall and reflect failures return empty results instead of crashing. Retain failures are reported. Every failure is written to the memory log and shown in Settings ("Last memory error") and the Memory Explorer.
- **Seed data (illustrative):** service catalogue with dependencies and runbooks; operating context on connection-pool incidents; services impacted by incidents; a real conflicting outcome (INC-0210); open and under-documented records so Knowledge Retention has genuine gaps.
- **Sidebar:** regrouped into Intelligence, Memory, Analytics and Management.

## Partial / pending

- **Live verification against Hindsight Cloud and Groq** must be done on your machine.
- **What-If quality depends on Groq.** Offline, the rule-based fallback mostly reports how much evidence exists.
- **Knowledge concentration** uses decision ownership only. Incident responders aren't recorded yet.
- **Storage is SQLite**, behind `app/store.py`. PostgreSQL would only touch that module.
- **Runbook drafts** can be copied or downloaded but not published to a wiki (no Confluence connector).
