# NEXUS business model

## The problem, in money

Engineering teams lose time in two predictable ways:

1. **They commit to plans that their own history says are wrong.** The same kind of work keeps running over its estimate, the same assumption ("no schema changes needed", "teams will adopt it voluntarily") keeps breaking, and the same person's warning keeps being overruled.
2. **They fight the same production fire more than once.** Someone restarts the service, it holds for three days, and the next on-call engineer doesn't know that's already been tried.

The knowledge exists: in ADRs, retros, postmortems, Slack threads and people's heads. Nothing connects a decision to what happened afterwards, so nobody learns from it at the moment it matters.

**Illustrative cost (an estimate, not measured data):** a 10-engineer team at a fully loaded ₹25–40 lakh per engineer per year costs roughly ₹5–8 lakh per week. One quarter-long project that slips by 4 weeks costs ₹20–32 lakh in salary alone, before the delay to revenue. If NEXUS prevents one such slip a year, it pays for itself many times over at the prices below.

## Customer

| | |
|---|---|
| **Buyer** | VP Engineering / CTO at software companies with 20–500 engineers |
| **Champion** | Engineering managers and staff engineers who run planning and incident review |
| **Daily users** | Tech leads writing design docs; on-call engineers |
| **First segment** | Indian and global SaaS and fintech companies: high incident cost, frequent migrations, compliance work that runs over |

## What they pay for

| Tier | Price | Includes |
|---|---|---|
| **Free** | ₹0 | 1 team, 20 decisions + incidents a month, premortem and incident investigation, 90-day memory |
| **Team** | $49 per team / month | Unlimited decisions and incidents, unlimited memory, calibration and lessons, GitHub PR nudge, Slack `/premortem` |
| **Business** | $15 per engineer / month (min. 25) | Multiple teams with separate memory banks, cross-team comparison, Jira / Confluence / PagerDuty / Opsgenie sync, decision replay over full history, SSO |
| **Enterprise** | Custom (from ~$40k / year) | Self-hosted Hindsight and LLM, data residency, audit logs, custom integrations, SLA |

Pricing is per team at the bottom because the value lives in the team's shared memory, and per engineer above that because value scales with how many people's decisions are remembered.

## Unit economics (assumptions to validate)

Variable cost per team is Hindsight retain/recall/reflect usage plus LLM tokens. A team that logs ~40 decisions and incidents and runs ~150 premortems or investigations a month is a small number of Hindsight calls and a few million Groq tokens. The goal is to keep that under ~$5 per team per month, for gross margin above 85% on the Team tier. These are planning targets; real numbers come from pilot usage.

## Why customers stay (the moat)

**Memory compounds.** After six months, a team's NEXUS bank holds its estimation bias, its assumption graveyard, the people whose warnings are worth listening to, and every fix that only bought a few days. A competitor can copy the features but not that history. Switching means starting over at "no history yet", so retention improves the longer a team uses it.

**Each outcome makes the product better for that customer.** Every logged outcome or resolved incident tightens the calibration and lessons. That creates a loop where the most active teams get the most accurate warnings.

## Go-to-market

1. **Product-led entry (months 0–6).** Free GitHub Action that comments a premortem on design-doc PRs, and a free Slack `/premortem` command. One engineering manager can install it without procurement. Seed memory by importing existing ADRs and postmortems.
2. **Team to company (months 6–12).** When three or more teams in one company use it, sell Business: cross-team comparison, Jira/Confluence/PagerDuty sync, SSO.
3. **Marketplaces.** Atlassian Marketplace and GitHub Marketplace listings for discovery and billing.
4. **Content.** Publish anonymised, aggregate findings ("migrations run over more than features") from opted-in customers, which is marketing only a memory product can produce.
5. **Enterprise.** Self-hosted Hindsight for regulated fintech and banking customers who can't send engineering history to a shared cloud.

## Competition and positioning

| Category | Examples | What they miss |
|---|---|---|
| Incident management | PagerDuty, incident.io, Rootly | Strong on response workflow; don't connect incidents back to the decisions that caused them, or forward into planning |
| Engineering analytics | LinearB, Jellyfish, Swarmia | Measure delivery metrics; don't remember assumptions, warnings or why things went wrong |
| Docs and wikis | Confluence, Notion | Store ADRs and postmortems; nothing reads them back at decision time |
| Generic AI assistants | Chat assistants, code copilots | Give generic risk lists; no team-specific memory, no learning from outcomes |

**Positioning:** NEXUS is the only tool that connects a decision to its outcome and its incidents, and uses that history before the next decision is made.

## Expansion

The engine is "remember a decision, its assumptions and its outcome; warn before the next one". The same model applies to other expensive, repeated decisions:
- **Product:** launch plans and pricing changes
- **Procurement:** vendor selection ("the last two vendors with this contract shape missed SLA")
- **Hiring:** headcount plans vs. actual ramp time
- **Security / compliance:** audit programmes, which is already where the platform team's data shows the biggest overrun

That turns NEXUS from an engineering tool into a decision-intelligence platform with one memory per team.

## Milestones and metrics

| Stage | Proof point |
|---|---|
| Pilot (3 design partners) | ≥70% of premortem warnings rated "useful" by the team; outcomes logged on ≥50% of decisions |
| Paid Team tier | 20 paying teams; month-2 retention ≥80% |
| Business tier | 3 companies with ≥3 teams each; first Jira/PagerDuty integrations live |
| Proof of value | Within one quarter, a customer's estimate error falls measurably on decisions where NEXUS was used vs. a baseline |

## Risks and how we handle them

| Risk | Mitigation |
|---|---|
| Teams don't log outcomes | Pull outcomes automatically from Jira cycle time and PagerDuty; one-click outcome form in Slack |
| Warnings feel like blame ("Priya was right, you were wrong") | Frame as credit to the person who raised it; team-level, not individual, reporting by default |
| Sensitive engineering data | Per-team banks, self-hosted Enterprise option, no training on customer data |
| Cold start | Import existing ADRs/postmortems on day one; "no history yet" is stated honestly rather than filled with generic advice |
