"""
PREMORTEM engine — learn *before* failure.

Pipeline for a proposal:
  1. Capture   : extract title / category / estimate / assumptions / risks           (feature 1)
  2. Recall    : 5 parallel Hindsight recall strategies over the team's bank         (feature 2)
  3. Analyse   : deterministic, as-of-dated stats from the structured history
                 -> estimate calibration, assumption graveyard, ignored warnings,
                    decision->incident links                                          (features 6, 7, 8)
  4. Reflect   : Hindsight reflect for the team's accumulated lessons                (feature 10)
  5. Synthesise: LLM turns memories + stats into a verdict and checklist; numbers
                 always come from step 3, never from the LLM
  6. Evidence  : every warning cites the decision / incident IDs it came from        (feature 4)

`use_memory=False` runs the same proposal through the LLM with no memory, for the
side-by-side comparison (feature 5). `as_of` restricts everything to history that
existed at that date (feature 14, Decision Replay).
"""
from __future__ import annotations

from datetime import date

from .. import analytics as A
from .. import llm, store
from ..memory import memory
from . import capture

GENERIC_SYSTEM = """You are a senior engineer doing a premortem on an engineering proposal.
You have NO knowledge of this team's history. Return JSON:
{"summary": str, "warnings": [{"title": str, "detail": str, "severity": "high|medium|low"}], "checklist": [str]}
Give 4-6 warnings."""

SYNTH_SYSTEM = """You are NEXUS, a premortem agent with the team's engineering memory.
You receive: the proposal, memories recalled from Hindsight, a reflection, and computed warnings
(their numbers are authoritative — do not change them).
Return JSON:
{"summary": "2-3 sentences, cite IDs like D-0112 / INC-0204",
 "verdict": "go" | "go-with-conditions" | "rethink",
 "checklist": ["concrete pre-commit actions grounded in the memories (max 6)"],
 "additional_warnings": [{"title": str, "detail": str, "severity": "high|medium|low", "evidence": ["D-xxxx"]}]}
Only add an additional warning if a recalled memory supports it; cite its ID. Max 2."""


def _generic(parsed: dict, text: str) -> dict:
    out = llm.complete_json(GENERIC_SYSTEM, text[:6000], temperature=0.4)
    if isinstance(out, dict) and out.get("warnings"):
        return {"summary": out.get("summary", ""), "warnings": out["warnings"], "checklist": out.get("checklist", []),
                "generated_by": "llm"}
    return {
        "summary": "Standard premortem with no team history: typical risks for this kind of change.",
        "warnings": [
            {"title": "Data loss or inconsistency during cutover", "detail": "Plan validation and reconciliation.", "severity": "high"},
            {"title": "Performance regression", "detail": "Load test before launch.", "severity": "medium"},
            {"title": "Timeline risk", "detail": "Projects like this often slip; add buffer.", "severity": "medium"},
            {"title": "Operational readiness", "detail": "Update runbooks, dashboards and alerts.", "severity": "low"},
        ],
        "checklist": ["Write a rollout plan", "Add monitoring", "Load test", "Communicate with stakeholders"],
        "generated_by": "template",
    }


def _resolve_evidence(memories: list[dict], as_of: str | None, exclude: str | None) -> list[dict]:
    """Attach source records to each memory; in replay mode drop anything that didn't exist yet."""
    out = []
    for m in memories:
        if as_of and not m["refs"]:
            continue  # can't date it, so it can't be trusted in a replay
        recs, drop = [], False
        for ref in m["refs"]:
            r = store.get(ref)
            if not r:
                continue
            when = r.get("proposed_at") or r.get("date") or ""
            known_at = r.get("closed_at") or r.get("date") or ""  # outcomes are only known once closed
            if ref == exclude or (as_of and (when >= as_of or known_at >= as_of)):
                drop = True
                break
            recs.append({"id": ref, "title": r["title"], "kind": "incident" if ref.startswith("INC") else "decision",
                         "date": when})
        if not drop:
            out.append({**m, "records": recs})
    return out


def run(team: str, text: str, parsed: dict | None = None, use_memory: bool = True,
        as_of: str | None = None, exclude_id: str | None = None) -> dict:
    parsed = parsed or capture.extract(text)
    if not use_memory:
        return {"mode": "without_memory", "proposal": parsed, **_generic(parsed, text)}

    title, cat = parsed.get("title", ""), parsed.get("category", "feature")
    services = parsed.get("services") or []
    assumptions = parsed.get("assumptions") or []

    # ---- 2. recall (parallel strategies)
    strategies = [
        (f"{title}. {parsed.get('summary', '')}", None),
        (f"How far over estimate did past {cat} work run? actual vs estimated weeks", ["kind:outcome"]),
        (f"Assumptions that broke: {'; '.join(assumptions) or title}", ["assumption:broken"]),
        (f"Risks people raised that were ignored for {', '.join(services) or cat} work, e.g. rollback", ["risk:ignored"]),
        (f"Production incidents on {', '.join(services) or title} caused by earlier decisions", ["kind:incident"]),
    ]
    raw = memory.recall_many(team, strategies, limit=6, purpose="premortem" + (" replay" if as_of else ""))
    evidence = _resolve_evidence(raw, as_of, exclude_id)

    # ---- 3. deterministic analysis
    warnings = []
    corr = A.corrected_estimate(team, cat, parsed.get("estimate_weeks"), before=as_of)
    if corr and corr["factor"] >= 1.3:
        warnings.append({
            "type": "estimate", "severity": "high" if corr["factor"] >= 1.8 else "medium",
            "title": f"{cat.capitalize()} work on this team runs {corr['factor']}x over estimate",
            "detail": (f"{corr['raw_estimate_weeks']} weeks is likely ~{corr['corrected_weeks']} weeks "
                       f"(range {corr['range_weeks'][0]}–{corr['range_weeks'][1]}), based on {corr['category_history']} "
                       f"past {cat} decisions."),
            "evidence": corr["based_on"],
            "previously": f"{corr['category_history']} past {cat} decisions took {corr['range_weeks'][0] / corr['raw_estimate_weeks']:.1f}–{corr['range_weeks'][1] / corr['raw_estimate_weeks']:.1f}x their estimate.",
            "why_now": f"This proposal estimates {corr['raw_estimate_weeks']} weeks for {cat} work.",
            "confidence": round(min(0.95, 0.5 + 0.1 * corr["category_history"]), 2),
        })
    for h in A.match_assumptions(team, assumptions, before=as_of):
        g = h["match"]
        warnings.append({
            "type": "assumption", "severity": "high" if g["break_rate"] >= 0.5 else "medium",
            "title": f"Assumption Graveyard: \"{h['new_assumption']}\"",
            "detail": (f"A similar assumption (\"{g['assumption']}\") broke in {g['times_broke']} of "
                       f"{g['times_made']} past decisions. Last time: {g['evidence'][-1]['note']}."),
            "evidence": [e["decision"] for e in g["evidence"]],
            "previously": "; ".join(f"{e['decision']}: {e['note']}" for e in g["evidence"][-3:]),
            "why_now": f"This proposal depends on \"{h['new_assumption']}\".",
            "confidence": round((g["times_broke"] + 1) / (g["times_made"] + 2), 2),
        })
    by_person: dict[str, list[dict]] = {}
    for iw in A.relevant_ignored(team, f"{title} {' '.join(assumptions)} rollback", services, cat, before=as_of):
        by_person.setdefault(iw["raised_by"], []).append(iw)
    for person, items in by_person.items():
        mat = [x for x in items if x["materialized"]]
        incs = [i for x in items for i in x["incidents"]]
        warnings.append({
            "type": "ignored_warning", "severity": "high" if mat else "medium",
            "title": (f"{person} warned about this {len(items)}x before — ignored every time" if len(items) > 1
                      else f"{person} warned about this before — it was ignored"),
            "detail": " ".join(f"{x['decision']}: \"{x['risk']}\"" + (f" → {', '.join(x['incidents'])}." if x["incidents"] else ".")
                               for x in items[:3]) + (f" {len(mat)} of {len(items)} materialized. Get {person}'s sign-off first."
                                                      if mat else ""),
            "evidence": [x["decision"] for x in items] + incs,
            "credit": person,
            "previously": "; ".join(f"{x['decision']}: \"{x['risk']}\" was ignored" + (" and happened" if x["materialized"] else "")
                                    for x in items[:3]),
            "why_now": "This proposal has the same shape: " + ", ".join(sorted({s_ for x in items for s_ in x["services"]} & set(services)) or [cat]) + ".",
            "confidence": round((len(mat) + 1) / (len(items) + 2), 2),
        })
    # decision -> incident connection: past decisions on the same services that caused incidents
    linked = []
    for d in A.closed_decisions(team, as_of):
        if d["id"] == exclude_id or not d.get("linked_incidents"):
            continue
        if set(d.get("services", [])) & set(services) or (d["category"] == cat and A.sim(d["title"], title) > 0.15):
            linked.append(d)
    if linked:
        incs = [i for d in linked for i in d["linked_incidents"]]
        warnings.append({
            "type": "incident_link", "severity": "high",
            "title": f"Similar decisions caused {len(incs)} production incident(s)",
            "detail": "; ".join(f"{d['id']} \"{d['title']}\" → {', '.join(d['linked_incidents'])}" for d in linked[:3]),
            "evidence": [d["id"] for d in linked[:3]] + incs[:4],
            "previously": f"{len(incs)} incident(s) followed decisions touching {', '.join(sorted({s_ for d in linked for s_ in d.get('services', [])}))}.",
            "why_now": f"This proposal touches {', '.join(services) or 'the same area'}.",
            "confidence": round(min(0.9, 0.5 + 0.08 * len(incs)), 2),
        })

    # ---- 4. reflect (skipped in replay: reflection can't be time-bounded)
    reflection = None if as_of else memory.reflect(
        team, f"We are about to start: \"{title}\" ({cat}, estimate {parsed.get('estimate_weeks')} weeks, "
              f"assumptions: {assumptions}). From our history, what should we remember before committing?",
        context="premortem before an engineering decision")

    # ---- 5. synthesis
    mem_lines = "\n".join(f"- [{', '.join(m['refs'])}] {m['text']}" for m in evidence[:14])
    synth = llm.complete_json(SYNTH_SYSTEM, (
        f"PROPOSAL:\n{text[:4000]}\n\nRECALLED MEMORIES:\n{mem_lines or 'none'}\n\nREFLECTION:\n{reflection or 'n/a'}\n\n"
        f"COMPUTED WARNINGS:\n" + "\n".join(f"- {w['title']}: {w['detail']}" for w in warnings)))
    if not isinstance(synth, dict):
        synth = {
            "summary": (f"{len(warnings)} memory-backed warnings from {len(evidence)} recalled memories."
                        if warnings else "No strong patterns in memory for this proposal yet."),
            "verdict": "rethink" if sum(w["severity"] == "high" for w in warnings) >= 3 else
                       "go-with-conditions" if warnings else "go",
            "checklist": [c for c in [
                f"Re-plan to ~{corr['corrected_weeks']} weeks or cut scope" if corr and corr["factor"] >= 1.3 else None,
                "Spike the graveyard assumptions before committing" if any(w["type"] == "assumption" for w in warnings) else None,
                "Write and test a rollback plan; get sign-off from whoever raised it last time"
                if any(w["type"] == "ignored_warning" for w in warnings) else None,
                "Load-test connection pools / consumer lag on the touched services"
                if any(w["type"] == "incident_link" for w in warnings) else None,
            ] if c],
            "additional_warnings": [],
        }
    for w in synth.get("additional_warnings") or []:
        if isinstance(w, dict) and w.get("title"):
            warnings.append({"type": "insight", "severity": w.get("severity", "medium"), "title": w["title"],
                             "detail": w.get("detail", ""), "evidence": w.get("evidence", []),
                             "previously": "", "why_now": w.get("detail", ""), "confidence": 0.5})

    if not as_of:
        store.log_event(team, "premortem", parsed.get("id") or title, date.today().isoformat(),
                        {"warnings": len(warnings), "memories": len(evidence)})
    first_time = not evidence and not warnings
    return {
        "mode": "replay" if as_of else "with_memory",
        "as_of": as_of,
        "proposal": parsed,
        "summary": synth.get("summary", ""),
        "verdict": synth.get("verdict", "go-with-conditions"),
        "checklist": synth.get("checklist", []),
        "warnings": warnings,
        "corrected_estimate": corr,
        "risk": A.predict_risk(team, parsed, as_of=as_of, exclude=exclude_id),
        "reflection": reflection,
        "evidence": evidence,
        "memory_stats": {"strategies": len(strategies), "recalled": len(raw), "used": len(evidence),
                         "bank": f"{team}", "memory_mode": memory.mode, "llm_mode": llm.mode},
        "first_time": first_time,
    }
