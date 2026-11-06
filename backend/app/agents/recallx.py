"""
RECALL-X engine — learn *after* failure.

For a new incident:
  * recall similar incidents, failed / temporary fixes and the decisions that touched the service
  * Failed-Fix Memory: which actions were tried before and what happened
  * Fix Decay: how long "temporary" fixes (restarts, scaling) actually lasted
  * Decision -> Incident connection: which earlier engineering decision likely set this up
  * engineer feedback is retained, so the next investigation starts smarter
"""
from __future__ import annotations

import re
from datetime import date

from .. import analytics as A
from .. import llm, store
from ..memory import memory

GENERIC_SYSTEM = """You are an on-call SRE with no knowledge of this company's history.
Given an incident description return JSON:
{"hypothesis": str, "recommended_actions": [{"action": str, "why": str}], "avoid": []}"""

SYNTH_SYSTEM = """You are RECALL-X, an incident investigator with the team's incident memory.
You receive the incident, recalled memories, and computed fix statistics (authoritative).
Return JSON:
{"hypothesis": "likely root cause, cite INC-/D- IDs",
 "recommended_actions": [{"action": str, "why": str, "evidence": ["INC-xxxx"]}],
 "avoid": [{"action": str, "why": str, "evidence": ["INC-xxxx"]}],
 "summary": "2 sentences"}
Recommend fixes that RESOLVED similar incidents first. Put fixes that failed or only worked temporarily in avoid."""


def _services() -> set[str]:
    s = set()
    for i in store.list_records("incident"):
        s.add(i["service"])
    for d in store.list_records("decision"):
        s.update(d.get("services", []))
    return s


def parse(text: str, service: str | None) -> dict:
    low = text.lower()
    svc = service or next((s for s in sorted(_services(), key=len, reverse=True) if s in low), None)
    sig = next((l.strip() for l in text.splitlines()
                if re.search(r"(error|exception|timeout|timed out|fatal|refused|lag|failed)", l, re.I)), text[:160])
    return {"service": svc, "error_signature": sig[:300], "description": text[:2000]}


def run(team: str, text: str, service: str | None = None, use_memory: bool = True) -> dict:
    """Investigate a new incident and open a record for it."""
    out = analyze(team, text, service, use_memory=use_memory)
    if not use_memory:
        return out
    p = out["parsed"]
    inc_id = store.next_id("INC")
    rec = {"id": inc_id, "team": team, "date": date.today().isoformat(), "service": p["service"] or "unknown",
           "title": text.strip().splitlines()[0][:120], "error_signature": p["error_signature"], "severity": "SEV2",
           "symptoms": [], "attempted_fixes": [], "root_cause": None, "resolution": None, "logs": text.strip().splitlines()[1:8],
           "timeline": [{"at": date.today().isoformat(), "event": "Incident opened in NEXUS", "kind": "detected"}],
           "linked_decision": (out["suspect_decisions"] or [{}])[0].get("id"), "ttr_minutes": None, "status": "open"}
    store.upsert("incident_open", rec)
    store.log_event(team, "investigation", inc_id, rec["date"], {"similar": len(out["similar_incidents"])})
    out["incident_id"] = inc_id
    return out


def create(team: str, title: str, service: str, severity: str, logs: list[str], symptoms: list[str]) -> dict:
    inc_id = store.next_id("INC")
    sig = next((l for l in logs if re.search(r"(error|exception|timeout|timed out|fatal|refused|lag|failed)", l, re.I)),
               logs[0] if logs else title)
    rec = {"id": inc_id, "team": team, "date": date.today().isoformat(), "service": service, "title": title,
           "error_signature": sig[:300], "severity": severity, "symptoms": symptoms, "attempted_fixes": [],
           "root_cause": None, "resolution": None, "logs": logs,
           "timeline": [{"at": date.today().isoformat(), "event": "Incident opened in NEXUS", "kind": "detected"}],
           "linked_decision": None, "ttr_minutes": None, "status": "open"}
    store.upsert("incident_open", rec)
    store.log_event(team, "incident_created", inc_id, rec["date"], {})
    return rec


def incident_text(rec: dict) -> str:
    return "\n".join([f"{rec['service']}: {rec['title']}", rec.get("error_signature", ""), *rec.get("symptoms", []),
                      *rec.get("logs", [])[:6]])


def analyze(team: str, text: str, service: str | None = None, use_memory: bool = True,
            as_of: str | None = None, exclude: str | None = None) -> dict:
    """Investigation without side effects. `as_of`/`exclude` let a historical incident be analysed
    with only the memory that existed before it."""
    p = parse(text, service)
    if not use_memory:
        out = llm.complete_json(GENERIC_SYSTEM, text[:4000], temperature=0.4)
        if not isinstance(out, dict):
            out = {"hypothesis": "Service is overloaded or a dependency is degraded.",
                   "recommended_actions": [{"action": f"Restart {p['service'] or 'the service'}", "why": "Clears bad state quickly"},
                                           {"action": "Scale out replicas", "why": "Adds capacity"},
                                           {"action": "Check recent deploys and logs", "why": "Find the trigger"}],
                   "avoid": []}
        return {"mode": "without_memory", "parsed": p, **out}

    svc = p["service"] or ""
    raw = memory.recall_many(team, [
        (f"{p['error_signature']} {svc}", ["kind:incident"]),
        (f"Fixes that failed or only worked temporarily on {svc}", ["fix:temporary", "fix:failed"]),
        (f"What resolved {svc} incidents with {p['error_signature'][:80]}", ["fix:resolved"]),
        (f"Engineering decisions that changed {svc}", ["kind:outcome"]),
    ], limit=6, purpose="incident investigation")
    evidence = []
    for m in raw:
        if exclude and exclude in m["refs"]:
            continue
        m["records"] = [{"id": r, "title": (store.get(r) or {}).get("title", ""),
                         "kind": "incident" if r.startswith("INC") else "decision"} for r in m["refs"] if store.get(r)]
        evidence.append(m)

    similar = [i for i in A.similar_incidents(team, p["service"], text, before=as_of) if i["id"] != exclude]
    fixes = A.fix_stats(team, p["service"], text, before=as_of)
    # decision -> incident connection
    suspects = {}
    for i in similar:
        if i.get("linked_decision"):
            d = store.get(i["linked_decision"])
            if d:
                suspects[d["id"]] = {"id": d["id"], "title": d["title"], "reason": f"caused similar incident {i['id']}",
                                     "ignored_risks": [r["text"] for r in d.get("risks", []) if not r["addressed"]]}
    recent_cut = (as_of or date.today().isoformat())[:4]
    for d in A.closed_decisions(team, as_of):
        if svc and svc in d.get("services", []) and d["id"] not in suspects and d.get("closed_at", "")[:4] >= str(int(recent_cut) - 1):
            suspects[d["id"]] = {"id": d["id"], "title": d["title"], "reason": f"recent change to {svc}",
                                 "ignored_risks": [r["text"] for r in d.get("risks", []) if not r["addressed"]]}

    stats_txt = "\n".join(f"- \"{f['action']}\": tried {f['tried']}x, resolved {f['resolved']}, temporary {f['temporary']}, "
                          f"failed {f['failed']}, avg lasted {f['avg_lasted_days']} days -> {f['verdict']} "
                          f"({', '.join(e['incident'] for e in f['events'])})" for f in fixes["fixes"])
    mem_txt = "\n".join(f"- [{', '.join(m['refs'])}] {m['text']}" for m in evidence[:12])
    out = llm.complete_json(SYNTH_SYSTEM, f"INCIDENT:\n{text[:3000]}\n\nMEMORIES:\n{mem_txt}\n\nFIX STATS:\n{stats_txt}\n\n"
                                          f"SUSPECT DECISIONS: {list(suspects.values())}")
    if not isinstance(out, dict):
        works = [f for f in fixes["fixes"] if f["verdict"] == "works"]
        bad = [f for f in fixes["fixes"] if f["verdict"] != "works"]
        top = similar[0] if similar else None
        out = {
            "hypothesis": (f"Matches {len(similar)} past incident(s); most similar is {top['id']} (root cause: {top['root_cause']})."
                           if top else "No similar incident in memory — first occurrence."),
            "recommended_actions": [{"action": f["action"], "why": f"Resolved {f['resolved']}/{f['tried']} similar incidents",
                                     "evidence": [e["incident"] for e in f["events"]]} for f in works[:3]],
            "avoid": [{"action": f["action"],
                       "why": (f"Only temporary in {f['temporary']}/{f['tried']} incidents (lasted ~{f['avg_lasted_days']} days)"
                               if f["temporary"] else f"Failed {f['failed']}/{f['tried']} times"),
                       "evidence": [e["incident"] for e in f["events"]]} for f in bad[:4]],
            "summary": "",
        }

    return {
        "mode": "replay" if as_of else "with_memory", "parsed": p, **out,
        "similar_incidents": [{k: i[k] for k in ("id", "title", "date", "service", "root_cause", "resolution", "similarity")}
                              for i in similar[:5]],
        "fix_decay": fixes["fixes"], "suspect_decisions": list(suspects.values())[:3], "evidence": evidence,
        "failed_fix_warnings": [f for f in fixes["fixes"] if f["verdict"] != "works"],
        "memory_stats": {"recalled": len(raw), "memory_mode": memory.mode, "llm_mode": llm.mode},
    }


def resolve(inc_id: str, body: dict) -> dict:
    rec = store.get(inc_id)
    if not rec:
        raise KeyError(inc_id)
    rec.update({k: v for k, v in body.items() if v is not None})
    rec["status"] = "resolved"
    now = date.today().isoformat()
    rec.setdefault("timeline", [])
    rec["timeline"] += [{"at": now, "event": f["action"], "kind": "fix-" + f["result"]} for f in rec.get("attempted_fixes", [])]
    rec["timeline"].append({"at": now, "event": "Incident resolved · outcome retained to memory", "kind": "resolved"})
    store.upsert("incident", rec)
    memory.retain_incident(rec)
    store.log_event(rec["team"], "incident_resolved", inc_id, date.today().isoformat(), {})
    return rec
