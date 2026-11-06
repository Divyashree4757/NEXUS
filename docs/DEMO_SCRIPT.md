# Demo script (about 3.5 minutes)

Before recording: `python -m app.seed --reset`, both servers running, sidebar shows **Memory: Hindsight** and **LLM: openai/gpt-oss-120b** in green. Browser zoom 110%, notifications off. Record at 1080p.

## 0:00–0:30 · Intro
*Screen: Overview dashboard.*
"I'm [name]. I built NEXUS, an agent that remembers every engineering decision a team makes and what happened afterwards, so it can warn the team before it repeats a mistake, and help on-call when something breaks again."

## 0:30–1:00 · The problem
*Decision Intelligence → **New decision** → **Fill with sample** → Continue ×3 → **Save and analyse**. Switch to **With vs without memory**.*
"The payments team wants to move webhooks to Kafka in three weeks. Without memory, the same model gives the list every premortem has: data loss, performance, add buffer. It's correct and it changes nothing."

## 1:00–2:00 · Memory on
*Switch back to **With memory**. Walk the risk gauge, estimate card, then expand the evidence cards.*
- "With Hindsight memory: realistic estimate is about 6 weeks, not 3, because this team's last four migrations ran 2.1 to 2.4x over." Click a D- chip to open the record drawer.
- "'No schema changes needed' has broken 5 of 5 times on this team."
- "Priya Raman warned about rollback on three earlier decisions. She was ignored every time and every time it became an incident."
- Scroll to **Raw memories recalled**: "Every warning comes from memories recalled from this team's Hindsight bank: five recall strategies, tagged by broken assumptions, ignored risks, incidents. Each one links to the record it came from."

## 2:00–2:40 · After failure
*Incident Intelligence → **Create incident** → **Fill with sample** → **Create and investigate**. Point at the red failed-fix banner, then type "restart the pods" in **Check a fix**.*
"Same memory, other direction. Connection-pool timeouts on payment-gateway. A generic agent says restart and scale out. NEXUS says: restarts only lasted about three days, four out of four times; increasing the pool made it worse; reducing per-pod pools with PgBouncer fixed it twice. And it points at decision D-0106, where the pool-sizing warning was ignored."
*Engineer feedback → **Resolve and retain to memory**.* "I tell it what fixed it, and that's retained straight back into Hindsight."

## 2:40–3:10 · It gets smarter
*Prediction Accuracy, then Memory Explorer (activity feed shows every retain/recall call, labelled Hindsight API).*
"This is the learning curve. Grey is the team's estimate error; violet is the error NEXUS would have had at each point, using only memories that existed then. It drops from about 35% to about 12% as memory builds."
*Expand a lesson under Evolving lessons.* "Lessons have a confidence that moves as outcomes come in."
*Decision Intelligence → D-0112 → Decision replay.* "Decision replay: what NEXUS would have said on the day this was proposed. It would have caught the overrun, the broken assumption and the ignored rollback risk."

## 3:10–3:30 · Takeaway
*Team Insights, then Knowledge Graph (click D-0106 to show it caused INC-0204).*
"What surprised me: remembering what failed, and who warned about it, mattered far more than remembering what worked. Each team gets its own memory bank, so payments learns it underestimates migrations and platform learns it underestimates compliance. And it shows up where decisions are made: as a comment on the design-doc pull request."

---

## YouTube title ideas (no event names)
- My agent remembers every engineering mistake my team made
- I gave my team's failed assumptions to an agent with memory
- An agent that says "we tried this before" — built on Hindsight
- Why my AI premortem remembers who was ignored
- Restarting the service lasted 3 days. My agent remembered.
