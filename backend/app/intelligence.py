"""
Organisational intelligence on top of the record store + Hindsight.

  decision_dna()   recurring decision patterns / blind spots, each computed from records
  conflicts()      memories that disagree (same fix: resolved vs failed; same assumption: held vs broke)
  propagation()    service dependency graph with declared, observed and inferred edges
  whatif()         counterfactual comparison of two options (hypothetical, evidence-backed)
  knowledge()      knowledge-continuity gaps (undocumented decisions, missing root causes, runbooks ...)
  learning()       learning-loop events: how each new outcome moved each lesson
  scorecard()      organisational memory indicators with explanation, trend, records, completeness

Rule for this module: every number is computed from stored records. When there isn't enough data for
a pattern we say so (status "insufficient_data") instead of producing one.
"""
from __future__ import annotations

import re
import statistics as st
from collections import Counter, defaultdict
from datetime import date

from . import analytics as A
from . import llm, store
from .memory import memory

DB_WORDS = {"schema", "postgres", "postgresql", "mysql", "cdc", "debezium", "pgbouncer", "redis", "database",
            "sql", "shard", "citus", "ledger", "feature", "store", "replica", "connection", "pool"}


def _half(d: str) -> str:
    return f"{d[:4]} H{1 if int(d[5:7]) <= 6 else 2}" if d and len(d) >= 7 else "unknown"


def _beta(hits: int, n: int) -> float:
    return round((hits + 1) / (n + 2), 2)


def _trend(items: list[tuple[str, bool]]) -> list[dict]:
    """items: (date, hit) -> rate per half-year."""
    b = defaultdict(lambda: [0, 0])
    for d, hit in items:
        b[_half(d)][0] += 1 if hit else 0
        b[_half(d)][1] += 1
    return [{"period": k, "hits": v[0], "n": v[1], "rate": round(v[0] / v[1], 2)} for k, v in sorted(b.items())]


def services(team: str) -> list[dict]:
    return [s for s in store.list_records("service", team)]


def all_incidents(team: str) -> list[dict]:
    return store.list_records("incident", team) + store.list_records("incident_open", team)


# ============================================================================ 1. Decision DNA
def decision_dna(team: str) -> dict:
    ds = A.closed_decisions(team)
    total = len(ds)
    pats = []

    def pattern(pid, title_fn, hits, pool, recommendation, kind, extra=None):
        n = len(pool)
        if n == 0:
            pats.append({"id": pid, "kind": kind, "status": "insufficient_data", "title": title_fn(0, 0),
                         "supporting": 0, "n": 0, "frequency": None, "confidence": None, "evidence": [],
                         "trend": [], "recommendation": "Record more decisions of this kind before drawing a conclusion."})
            return
        h = len(hits)
        ev = [{"id": x["id"], "title": x["title"], "date": x.get("closed_at") or x.get("date"),
               "detail": extra(x) if extra else ""} for x in hits]
        pats.append({"id": pid, "kind": kind, "status": "pattern" if h >= 2 and h / n >= 0.5 else "weak" if h else "not_observed",
                     "title": title_fn(h, n), "supporting": h, "n": n, "frequency": round(h / n, 2),
                     "confidence": _beta(h, n), "evidence": ev,
                     "trend": _trend([(x.get("closed_at") or x.get("date"), x in hits) for x in pool]),
                     "recommendation": recommendation})

    over = lambda d: A.ratio(d) >= 1.3  # noqa: E731
    # 1. estimation behaviour
    last10 = ds[-10:]
    pattern("estimation", lambda h, n: f"Underestimated effort in {h} of its last {n} completed decisions",
            [d for d in last10 if over(d)], last10,
            "Apply the NEXUS-corrected estimate by default and review estimates against the category factor.",
            "estimation", lambda d: f"{d['estimate_weeks']}w → {d['actual_weeks']}w ({A.ratio(d):.1f}x)")
    # 2. infra / migration overruns
    mig = [d for d in ds if d["category"] in ("migration", "infra")]
    pattern("migration_overrun", lambda h, n: f"Infrastructure and migration work overran in {h} of {n} projects",
            [d for d in mig if over(d)], mig,
            "Budget migrations at the team's historical factor and add an explicit cutover + rollback phase.",
            "estimation", lambda d: f"{d['category']} · {A.ratio(d):.1f}x estimate")
    # 3. frequently broken assumptions
    yard = [g for g in A.assumption_graveyard(team) if g["times_made"] >= 2]
    made = sum(g["times_made"] for g in yard)
    broke_ev = []
    for g in yard:
        for e in g["evidence"]:
            broke_ev.append({"id": e["decision"], "title": f"“{g['assumption']}”", "date": e["date"], "detail": e["note"]})
    if yard:
        top = yard[0]
        pats.append({"id": "assumptions", "kind": "assumption", "status": "pattern",
                     "title": f"“{top['assumption']}” broke in {top['times_broke']} of {top['times_made']} decisions that relied on it",
                     "supporting": sum(g["times_broke"] for g in yard), "n": made,
                     "frequency": round(sum(g["times_broke"] for g in yard) / made, 2),
                     "confidence": _beta(sum(g["times_broke"] for g in yard), made), "evidence": broke_ev,
                     "trend": _trend([(e["date"], True) for e in broke_ev]),
                     "recommendation": "Turn repeat assumptions into a spike or acceptance test before the estimate is committed.",
                     "breakdown": [{"assumption": g["assumption"], "broke": g["times_broke"], "made": g["times_made"]} for g in yard]})
    else:
        pattern("assumptions", lambda h, n: "Frequently broken assumptions", [], [], "", "assumption")
    # 4. repeated architectural mistakes: shipping without a tested rollback path
    rb = [d for d in ds if any("rollback" in r["text"].lower() for r in d.get("risks", []))]
    pattern("rollback", lambda h, n: f"Shipped without a tested rollback path in {h} of {n} decisions where rollback was raised",
            [d for d in rb if any("rollback" in r["text"].lower() and not r["addressed"] for r in d["risks"])], rb,
            "Make a tested rollback plan an exit criterion for any migration or cutover.",
            "architecture", lambda d: ", ".join(d.get("linked_incidents") or []) or "no incident")
    # 5. ignored warnings
    ign = A.ignored_warnings(team)
    raised = [d for d in ds if d.get("risks")]
    pattern("ignored", lambda h, n: f"Raised warnings were ignored and then happened in {h} of {n} decisions with raised risks",
            [d for d in raised if any(not r["addressed"] and r["materialized"] for r in d["risks"])], raised,
            "Require an explicit owner and decision for every raised risk; surface the raiser's track record in review.",
            "warning", lambda d: "; ".join(f"{r['raised_by']}: {r['text']}" for r in d["risks"] if not r["addressed"]))
    # 6. security review delays
    sec = [d for d in ds if d["category"] == "security"]
    pattern("security", lambda h, n: f"Security and compliance work ran late in {h} of {n} projects" if n else "Security review delays",
            [d for d in sec if over(d)], sec,
            "Start security reviews and auditor evidence collection in week one, not at the end.",
            "estimation", lambda d: f"{A.ratio(d):.1f}x estimate")
    # 7. database complexity underestimation
    dbd = [d for d in ds if A.tokens(d["title"] + " " + " ".join(a["text"] for a in d["assumptions"]) + " " + " ".join(d["services"])) & DB_WORDS]
    pattern("database", lambda h, n: f"Database-related work took 1.5x+ its estimate in {h} of {n} decisions",
            [d for d in dbd if A.ratio(d) >= 1.5], dbd,
            "Add a data-migration spike (schema, connection limits, replication) before estimating database work.",
            "estimation", lambda d: f"{A.ratio(d):.1f}x estimate")
    # 8. repeated temporary fixes
    incs = [i for i in store.list_records("incident", team)]
    temp = [i for i in incs if any(f["result"] == "temporary" for f in i["attempted_fixes"])]
    pattern("temporary_fixes", lambda h, n: f"A temporary fix was tried first in {h} of {n} incidents",
            temp, incs, "Add 'what made this come back last time?' to the incident template; link to the fix-decay chart.",
            "fix", lambda i: next(f"{f['action']} (lasted {f.get('lasted_days')}d)" for f in i["attempted_fixes"] if f["result"] == "temporary"))
    for p in pats:
        p["team"] = team
    return {"team": team, "closed_decisions": total, "patterns": pats}


# ============================================================================ 4. Memory conflicts
_NUM = re.compile(r"(\d+)\s*->\s*(\d+)")


def _fix_context_diff(a: dict, b: dict, action_a: str, action_b: str) -> tuple[list[dict], str | None]:
    ca, cb = a.get("context") or {}, b.get("context") or {}
    keys = sorted(set(ca) | set(cb))
    diffs = [{"field": k, "a": ca.get(k), "b": cb.get(k), "differs": ca.get(k) != cb.get(k)} for k in keys]
    expl = None
    ma, mb = _NUM.search(action_a), _NUM.search(action_b)
    if ca.get("replicas") and cb.get("replicas") and ca.get("db_max_connections") and cb.get("db_max_connections"):
        pa = int(ma.group(2)) if ma else ca.get("pool_per_pod")
        pb = int(mb.group(2)) if mb else cb.get("pool_per_pod")
        da, db_ = ca["replicas"] * pa, cb["replicas"] * pb
        diffs.insert(0, {"field": "connections after change (replicas × pool)", "a": f"{ca['replicas']}×{pa} = {da} of {ca['db_max_connections']}",
                         "b": f"{cb['replicas']}×{pb} = {db_} of {cb['db_max_connections']}", "differs": True, "computed": True})
        expl = (f"In {a['id']} the change brought total connections to {da} of {ca['db_max_connections']} allowed "
                f"({round(100 * da / ca['db_max_connections'])}%), so the database had headroom. In {b['id']} it pushed demand to "
                f"{db_} against a {cb['db_max_connections']}-connection limit ({round(100 * db_ / cb['db_max_connections'])}%), "
                f"so a bigger pool added load instead of capacity.")
    return diffs, expl


def conflicts(team: str, service: str | None = None, with_recall: bool = True, before: str | None = None) -> list[dict]:
    out = []
    incs = [i for i in store.list_records("incident", team) if not before or (i.get("date") or "") < before]
    # (a) fix conflicts: same action family, different results
    clusters: list[dict] = []
    for i in incs:
        for f in i["attempted_fixes"]:
            best = max(clusters, key=lambda c: A.sim(c["action"], f["action"]), default=None)
            if best and A.sim(best["action"], f["action"]) >= 0.45:
                c = best
            else:
                c = {"action": f["action"], "events": []}
                clusters.append(c)
            c["events"].append({"incident": i, "action": f["action"], "result": f["result"], "lasted_days": f.get("lasted_days")})
    for c in clusters:
        good = [e for e in c["events"] if e["result"] == "resolved"]
        bad = [e for e in c["events"] if e["result"] in ("failed", "temporary")]
        if not good or not bad:
            continue
        if service and service not in {e["incident"]["service"] for e in c["events"]}:
            continue
        a, b = good[0], bad[0]
        diffs, expl = _fix_context_diff(a["incident"], b["incident"], a["action"], b["action"])
        missing = [e["incident"]["id"] for e in c["events"] if not e["incident"].get("context")]
        out.append({
            "id": f"fix:{c['action'][:40]}", "type": "fix", "subject": re.sub(r"\s*\d+\s*->\s*\d+", "", c["action"]).strip(),
            "summary": f"“{re.sub(r'\s*\d+\s*->\s*\d+', '', c['action']).strip()}” resolved {len(good)} incident(s) but failed or only helped temporarily in {len(bad)}.",
            "a": {"label": "Worked", "action": a["action"], "result": a["result"], "ref": a["incident"]["id"],
                  "title": a["incident"]["title"], "service": a["incident"]["service"], "root_cause": a["incident"].get("root_cause")},
            "b": {"label": "Did not work", "action": b["action"], "result": b["result"], "ref": b["incident"]["id"],
                  "title": b["incident"]["title"], "service": b["incident"]["service"], "root_cause": b["incident"].get("root_cause")},
            "others": [{"ref": e["incident"]["id"], "result": e["result"], "action": e["action"]} for e in c["events"] if e is not a and e is not b][:6],
            "context_differences": diffs, "explanation": expl,
            "missing_context": missing,
            "recommendation": ("Don't apply either outcome blindly. Check the current replicas × pool size against the database "
                               "connection limit first: grow the pool only if total demand stays well under the limit; otherwise "
                               "reduce per-pod pools or add PgBouncer." if expl else
                               "Neither outcome should be applied blindly. Record the operating context (load, limits, topology) "
                               "for the next occurrence so the difference can be explained."),
            "counts": {"resolved": len(good), "failed": sum(e["result"] == "failed" for e in bad), "temporary": sum(e["result"] == "temporary" for e in bad)},
        })
    # (b) assumption conflicts: same assumption held in some decisions, broke in others
    if not service and not before:
        for g in A.assumption_graveyard(team):
            if g["times_made"] > g["times_broke"] > 0:
                held_ids = [d for d in g["decisions"] if d not in {e["decision"] for e in g["evidence"]}]
                h = store.get(held_ids[0]) if held_ids else None
                b = store.get(g["evidence"][0]["decision"])
                if not h or not b:
                    continue
                diffs = [{"field": f, "a": h.get(f) if f != "services" else ", ".join(h["services"]),
                          "b": b.get(f) if f != "services" else ", ".join(b["services"]),
                          "differs": h.get(f) != b.get(f)} for f in ("category", "services", "project", "proposed_at")]
                out.append({
                    "id": f"asm:{g['assumption'][:40]}", "type": "assumption", "subject": g["assumption"],
                    "summary": f"“{g['assumption']}” held in {g['times_made'] - g['times_broke']} decision(s) and broke in {g['times_broke']}.",
                    "a": {"label": "Held", "action": g["assumption"], "result": "held", "ref": h["id"], "title": h["title"], "service": ", ".join(h["services"])},
                    "b": {"label": "Broke", "action": g["assumption"], "result": "broke", "ref": b["id"], "title": b["title"],
                          "service": ", ".join(b["services"]), "root_cause": g["evidence"][0]["note"]},
                    "others": [{"ref": e["decision"], "result": "broke", "action": e["note"]} for e in g["evidence"][1:]][:6],
                    "context_differences": diffs, "explanation": None, "missing_context": [],
                    "recommendation": "Treat this assumption as unverified: confirm it with a short spike for this specific vendor or system.",
                    "counts": {"resolved": g["times_made"] - g["times_broke"], "failed": g["times_broke"], "temporary": 0},
                })
    if with_recall:
        for cf in out[:4]:
            try:
                mem = memory.recall(team, f"What happened when we tried: {cf['subject']}", limit=4, purpose="memory conflict detector")
                cf["memories"] = [{"text": m["text"], "refs": m["refs"], "source": m.get("source"), "type": m.get("type")} for m in mem]
            except Exception as e:  # never hide the conflict because recall failed
                cf["memories"], cf["recall_error"] = [], str(e)
    return out


def explain_conflict(team: str, cid: str) -> dict:
    cf = next((c for c in conflicts(team, with_recall=False) if c["id"] == cid), None)
    if not cf:
        return {"error": "conflict not found"}
    out = llm.complete_json(
        "You are a staff SRE. Two historical memories disagree. Explain why the outcomes differ using ONLY the given context, "
        "say what is still unknown, and give a cautious recommendation. Return JSON {\"why\": str, \"unknowns\": [str], \"recommendation\": str}.",
        str({k: cf[k] for k in ("summary", "a", "b", "context_differences", "explanation", "others")}))
    return {"conflict": cf["id"], "llm": out if isinstance(out, dict) else None, "available": isinstance(out, dict),
            "message": None if isinstance(out, dict) else "The LLM is offline; the computed explanation above is all NEXUS can say."}


# ============================================================================ 3. Risk propagation
def propagation(team: str) -> dict:
    svcs = {s["name"]: s for s in services(team)}
    decisions = store.list_records("decision", team)
    incs = all_incidents(team)
    names = set(svcs) | {s for d in decisions for s in d.get("services", [])} | {i["service"] for i in incs}
    edges = []
    for s in svcs.values():
        for dep in s.get("depends_on", []):
            names.add(dep)
            edges.append({"source": dep, "target": s["name"], "kind": "declared", "why": f"{s['name']} depends on {dep} (service catalogue)"})
    for i in incs:
        for imp in i.get("impacted_services", []):
            names.add(imp)
            edges.append({"source": i["service"], "target": imp, "kind": "observed",
                          "why": f"{i['id']}: failure in {i['service']} affected {imp}", "ref": i["id"]})
    declared = {(e["source"], e["target"]) for e in edges if e["kind"] == "declared"} | {(e["target"], e["source"]) for e in edges if e["kind"] == "declared"}
    co = Counter()
    for d in decisions:
        ss = sorted(set(d.get("services", [])))
        for x in range(len(ss)):
            for y in range(x + 1, len(ss)):
                co[(ss[x], ss[y])] += 1
    for (a, b), n in co.items():
        if (a, b) not in declared:
            edges.append({"source": a, "target": b, "kind": "inferred", "why": f"inferred: changed together in {n} decision(s)", "weight": n})
    nodes = []
    for n in sorted(names):
        si = [i for i in incs if i["service"] == n]
        sd = [d for d in decisions if n in d.get("services", [])]
        meta = svcs.get(n, {})
        nodes.append({"id": n, "tier": meta.get("tier", "unknown"), "runbook": meta.get("runbook"), "catalogued": n in svcs,
                      "incidents": [i["id"] for i in si], "sev1": sum(i.get("severity") == "SEV1" for i in si),
                      "decisions": [d["id"] for d in sd],
                      "decision_incidents": sorted({x for d in sd for x in d.get("linked_incidents", [])}),
                      "risk": min(100, 12 * len(si) + 15 * sum(i.get("severity") == "SEV1" for i in si) + 4 * len(sd))})
    return {"team": team, "nodes": nodes, "edges": edges,
            "legend": {"declared": "from the service catalogue", "observed": "seen in a past incident", "inferred": "inferred from decisions that changed both services"}}


# ============================================================================ 2. What-if simulator
TECH = {"kafka", "rabbitmq", "postgres", "postgresql", "mongodb", "mysql", "redis", "elasticache", "sqs", "cron", "pgbouncer",
        "debezium", "cdc", "loki", "elk", "jenkins", "actions", "vault", "istio", "backstage", "citus", "shard", "graviton", "arm"}


def _evidence_for(team: str, option: str, exclude: set | None = None) -> dict:
    words = A.tokens(option)
    techs = words & TECH
    hits = []
    for d in store.list_records("decision", team):
        if exclude and d["id"] in exclude:
            continue
        text = f"{d['title']} {' '.join(a['text'] for a in d['assumptions'])} {' '.join(d['services'])}"
        score = A.sim(option, text) + 0.4 * len(techs & A.tokens(text))
        if score >= 0.3:
            hits.append((score, d))
    hits.sort(key=lambda x: -x[0])
    ds = [d for _, d in hits[:5]]
    closed = [d for d in ds if d.get("actual_weeks")]
    incs = sorted({i for d in ds for i in d.get("linked_incidents", [])})
    broke = [{"decision": d["id"], "assumption": a["text"], "note": a.get("note")} for d in ds for a in d["assumptions"] if a.get("held") is False]
    return {
        "matched_terms": sorted(techs),
        "decisions": [{"id": d["id"], "title": d["title"], "ratio": round(A.ratio(d), 2) if d.get("actual_weeks") else None,
                       "incidents": d.get("linked_incidents", []), "status": d["status"]} for d in ds],
        "n": len(ds), "avg_ratio": round(st.mean(A.ratio(d) for d in closed), 2) if closed else None,
        "incidents": incs, "broken_assumptions": broke[:5],
    }


def whatif(team: str, body: dict) -> dict:
    orig, alt = body["original"], body["alternative"]
    ev_o, ev_a = _evidence_for(team, orig), _evidence_for(team, alt)
    shared = {d["id"] for d in ev_o["decisions"]} & {d["id"] for d in ev_a["decisions"]}
    shared_rows = [d for d in ev_o["decisions"] if d["id"] in shared]
    if shared:  # a decision that mentions both options isn't evidence for either one alone
        ev_o, ev_a = _evidence_for(team, orig, exclude=shared), _evidence_for(team, alt, exclude=shared)
    mem_o = memory.recall(team, f"Experience with: {orig}", limit=5, purpose="what-if simulator")
    mem_a = memory.recall(team, f"Experience with: {alt}", limit=5, purpose="what-if simulator")
    ctx = {k: body.get(k) for k in ("description", "workload", "constraints", "infrastructure")}
    llm_out = llm.complete_json(
        "You compare two engineering options for a team. Use the team's historical evidence where it exists and say "
        "plainly when evidence is missing. This is a hypothetical estimate, not a historical result. Return JSON: "
        "{\"original\": {\"advantages\": [str], \"disadvantages\": [str], \"risks\": [str], \"operational_complexity\": \"low|medium|high\"}, "
        "\"alternative\": {same keys}, \"final\": {\"recommended\": \"original|alternative|insufficient evidence\", "
        "\"reasons\": [str], \"missing_information\": [str], \"confidence\": \"low|medium|high\", \"tradeoffs\": [str]}}. "
        "Cite decision/incident IDs from the evidence when you use them.",
        str({"original": orig, "alternative": alt, "context": ctx,
             "original_history": ev_o, "alternative_history": ev_a,
             "original_memories": [m["text"][:400] for m in mem_o], "alternative_memories": [m["text"][:400] for m in mem_a]}),
        max_tokens=2200)
    if isinstance(llm_out, dict) and llm_out.get("final"):
        analysis, generated_by = llm_out, "llm"
    else:
        def side(ev, name):
            adv, dis, risks = [], [], []
            if not ev["n"]:
                dis.append(f"No team history for {name}: any estimate is a guess.")
            else:
                if ev["avg_ratio"] and ev["avg_ratio"] < 1.4:
                    adv.append(f"Past work like this landed close to estimate ({ev['avg_ratio']}x over {ev['n']} decisions).")
                if ev["avg_ratio"] and ev["avg_ratio"] >= 1.4:
                    dis.append(f"Past work like this ran {ev['avg_ratio']}x over estimate.")
                if ev["incidents"]:
                    risks.append(f"Similar decisions led to {len(ev['incidents'])} incident(s): {', '.join(ev['incidents'][:4])}.")
                for b in ev["broken_assumptions"][:2]:
                    risks.append(f"{b['decision']}: “{b['assumption']}” broke ({b['note']}).")
                if not ev["incidents"]:
                    adv.append("No incidents linked to similar past decisions.")
            return {"advantages": adv, "disadvantages": dis, "risks": risks, "operational_complexity": "unknown"}
        score = lambda ev: (ev["avg_ratio"] or 1.5) + 0.3 * len(ev["incidents"]) if ev["n"] else None  # noqa: E731
        so, sa = score(ev_o), score(ev_a)
        rec = "insufficient evidence" if so is None or sa is None else ("original" if so <= sa else "alternative")
        reasons_extra = [f"Only shared record: {d['id']} ({d['title']}) — {d['ratio']}x estimate" +
                         (f", led to {', '.join(d['incidents'])}" if d["incidents"] else "") for d in shared_rows if d.get("ratio")]
        analysis = {"original": side(ev_o, orig), "alternative": side(ev_a, alt),
                    "final": {"recommended": rec,
                              "reasons": (["Compared only on this team's recorded overruns and incidents for similar work."] if rec != "insufficient evidence"
                                          else ["At least one option has no comparable history in this team's memory."]) + reasons_extra,
                              "missing_information": ["Expected load profile", "Team familiarity with each option", "Operational ownership"],
                              "confidence": "low", "tradeoffs": []}}
        generated_by = "rules (LLM offline)"
    return {"hypothetical": True, "generated_by": generated_by, "original": orig, "alternative": alt, "context": ctx,
            "evidence": {"original": ev_o, "alternative": ev_a, "shared": shared_rows},
            "memories": {"original": mem_o, "alternative": mem_a}, "analysis": analysis, "memory_mode": memory.mode}


# ============================================================================ 5. Knowledge retention
def knowledge(team: str) -> dict:
    decisions = store.list_records("decision", team)
    incs = store.list_records("incident", team)
    svcs = {s["name"]: s for s in services(team)}
    gaps = []

    def gap(kind, severity, title, detail, refs, action, action_kind):
        gaps.append({"kind": kind, "severity": severity, "title": title, "detail": detail, "refs": refs,
                     "action": action, "action_kind": action_kind})

    # decisions: incomplete documentation / no outcome
    doc_scores = []
    missing_by_field = defaultdict(list)
    for d in decisions:
        fields = {"estimate": bool(d.get("estimate_weeks")), "assumptions": bool(d.get("assumptions")),
                  "risks": bool(d.get("risks")), "outcome summary": d.get("status") == "closed" and bool(d.get("outcome_summary"))}
        doc_scores.append(sum(fields.values()) / len(fields))
        for k, v in fields.items():
            if not v and not (k == "outcome summary" and d.get("status") == "open"):
                missing_by_field[k].append(d["id"])
        if not d.get("assumptions") and not d.get("risks"):
            gap("decision_docs", "medium", f"{d['id']} has no recorded assumptions or risks",
                f"{d['title']}: nothing to learn from when it is recalled later.", [d["id"]], "Record the architectural decision", "decision")
        if d.get("status") == "open":
            gap("no_outcome", "low", f"{d['id']} has no recorded outcome yet", f"In progress since {d['proposed_at']}: {d['title']}",
                [d["id"]], "Record the outcome when it ships", "decision")
    for field, ids in missing_by_field.items():
        if field in ("risks", "outcome summary") and len(ids) > 1:
            gap("decision_docs", "low", f"{len(ids)} decisions have no recorded {field}",
                "Not always a problem, but recalled memories are thinner without it.", ids, "Record the architectural decision", "decision")
    # incidents: missing root cause / no resolution
    inc_scores = []
    for i in incs:
        fields = {"root_cause": bool(i.get("root_cause")), "resolution": bool(i.get("resolution")),
                  "fix_that_worked": any(f["result"] == "resolved" for f in i["attempted_fixes"])}
        inc_scores.append(sum(fields.values()) / len(fields))
        if not i.get("root_cause"):
            gap("root_cause", "high", f"{i['id']} has no confirmed root cause", f"{i['service']}: {i['title']}", [i["id"]],
                "Request engineer confirmation of the root cause", "incident")
        if not fields["fix_that_worked"]:
            gap("no_resolution", "high", f"{i['id']} was only mitigated, never resolved",
                "Only temporary fixes are recorded: " + ", ".join(f["action"] for f in i["attempted_fixes"]), [i["id"]],
                "Document the missing resolution", "incident")
    # services: runbooks, documented procedures, knowledge concentration
    by_svc = defaultdict(list)
    for i in incs:
        by_svc[i["service"]].append(i)
    svc_rows = []
    for name in sorted(set(svcs) | set(by_svc)):
        si = by_svc.get(name, [])
        documented = sum(1 for i in si if any(f["result"] == "resolved" for f in i["attempted_fixes"]))
        owners = Counter(d["owner"] for d in decisions if name in d.get("services", []))
        nd = sum(owners.values())
        runbook = svcs.get(name, {}).get("runbook")
        svc_rows.append({"service": name, "incidents": len(si), "documented_resolutions": documented, "runbook": runbook,
                         "decisions": nd, "contributors": len(owners), "tier": svcs.get(name, {}).get("tier")})
        if si and not runbook:
            gap("runbook", "high" if svcs.get(name, {}).get("tier") == "critical" else "medium",
                f"{name} has {len(si)} incident(s) and no runbook",
                f"{documented} of {len(si)} incidents have a documented resolution procedure.", [i["id"] for i in si],
                "Create a runbook", "runbook")
        elif si and documented < len(si):
            gap("procedures", "medium", f"{name} has {len(si)} incidents but only {documented} documented resolution procedures",
                "Some incidents were closed without a fix that is known to work.", [i["id"] for i in si if not any(f["result"] == "resolved" for f in i["attempted_fixes"])],
                "Document the missing resolution", "incident")
        if nd >= 2 and len(owners) == 1:
            gap("concentration", "medium", f"All {nd} decisions on {name} were made by one contributor",
                "Knowledge continuity risk: the context behind these decisions sits with a single person. This is about coverage, not performance.",
                [d["id"] for d in decisions if name in d.get("services", [])], "Pair a second engineer and record the reasoning", "decision")
        if name in svcs and not si and nd == 0:
            gap("no_history", "low", f"{name} has no recorded decisions or incidents",
                "NEXUS can't warn about a service it has never seen. Import its history or design docs.", [], "Connect related records", "none")
    # unresolved lessons: contested confidence
    for l in A.lessons(team):
        if 0.35 <= l["confidence"] <= 0.6 and len(l["history"]) >= 2:
            gap("unresolved_lesson", "low", f"Unresolved lesson: {l['lesson']}",
                f"Evidence is split ({round(l['confidence'] * 100)}% confidence over {len(l['history'])} outcomes).",
                [h["ref"] for h in l["history"]][-4:], "Connect related incidents and confirm", "none")
    completeness = round(100 * st.mean(doc_scores + inc_scores), 1) if doc_scores or inc_scores else None
    sev_order = {"high": 0, "medium": 1, "low": 2}
    gaps.sort(key=lambda g: sev_order[g["severity"]])
    return {
        "team": team,
        "metrics": {
            "documentation_completeness": completeness,
            "unresolved_gaps": len(gaps),
            "incidents_without_root_cause": sum(1 for i in incs if not i.get("root_cause")),
            "decisions_without_outcome": sum(1 for d in decisions if d.get("status") == "open"),
            "services_limited_knowledge": sum(1 for r in svc_rows if r["incidents"] + r["decisions"] <= 1),
            "concentration_warnings": sum(1 for g in gaps if g["kind"] == "concentration"),
        },
        "gaps": gaps, "services": svc_rows,
    }


def runbook_draft(team: str, service: str) -> dict:
    incs = [i for i in store.list_records("incident", team) if i["service"] == service]
    fixes = A.fix_stats(team, service, None)["fixes"] if incs else []
    lines = [f"# Runbook: {service}", "", f"_Drafted by NEXUS from {len(incs)} remembered incident(s). Review before publishing._", ""]
    sigs = sorted({i["error_signature"] for i in incs})
    if sigs:
        lines += ["## Symptoms seen before", *[f"- `{s}`" for s in sigs], ""]
    works = [f for f in fixes if f["verdict"] == "works"]
    bad = [f for f in fixes if f["verdict"] != "works"]
    lines += ["## Do this first"] + ([f"1. {f['action']} — resolved {f['resolved']}/{f['tried']} ({', '.join(e['incident'] for e in f['events'])})" for f in works]
                                     or ["- No fix is confirmed to work yet. Capture what you try."]) + [""]
    if bad:
        lines += ["## Don't rely on"] + [f"- {f['action']} — {f['failed']} failed, {f['temporary']} temporary"
                                         + (f" (lasted ~{f['avg_lasted_days']}d)" if f["avg_lasted_days"] is not None else "") for f in bad] + [""]
    rcs = [f"- {i['id']}: {i['root_cause']}" for i in incs if i.get("root_cause")]
    lines += ["## Known root causes"] + (rcs or ["- None confirmed yet."]) + [""]
    missing = [i["id"] for i in incs if not i.get("root_cause")]
    if missing:
        lines += ["## Open questions", f"- Root cause still unconfirmed for {', '.join(missing)}.", ""]
    return {"service": service, "markdown": "\n".join(lines), "incidents": [i["id"] for i in incs]}


# ============================================================================ 6. Learning engine
def learning(team: str) -> dict:
    lessons = A.lessons(team)
    by_ref = defaultdict(list)
    for l in lessons:
        prev = 0.5
        for h in l["history"]:
            by_ref[h["ref"]].append({"lesson": l["lesson"], "kind": l["kind"], "before": prev, "after": h["confidence"],
                                     "event": h["event"], "detail": h["detail"]})
            prev = h["confidence"]
    events = []
    live_refs = {e["ref"] for e in store.events(team) if e["kind"] in ("outcome", "incident_resolved")}
    for ref, changes in by_ref.items():
        rec = store.get(ref) or {}
        when = rec.get("closed_at") or rec.get("date") or ""
        events.append({"ref": ref, "title": rec.get("title", ref), "date": when,
                       "kind": "incident" if ref.startswith("INC") else "decision",
                       "live": ref in live_refs, "changes": changes,
                       "net_change": round(sum(c["after"] - c["before"] for c in changes), 2)})
    events.sort(key=lambda e: e["date"], reverse=True)
    ops = store.op_counts(team)
    ev = Counter(e["kind"] for e in store.events(team))
    decisions = store.list_records("decision", team)
    incs = store.list_records("incident", team)
    steps = [
        {"step": 1, "name": "Decision", "count": len(decisions), "unit": "decisions recorded"},
        {"step": 2, "name": "Memory recall", "count": ops.get("recall", 0), "unit": "recall calls"},
        {"step": 3, "name": "Prediction", "count": ev.get("premortem", 0), "unit": "premortems run this session"},
        {"step": 4, "name": "Implementation", "count": sum(len(d.get("progress", [])) for d in decisions), "unit": "progress notes"},
        {"step": 5, "name": "Incident investigation", "count": ev.get("investigation", 0), "unit": "investigations this session"},
        {"step": 6, "name": "Outcome recording", "count": sum(d.get("status") == "closed" for d in decisions) + len(incs), "unit": "outcomes on record"},
        {"step": 7, "name": "Memory retention", "count": ops.get("retain", 0) + ops.get("retain_batch", 0), "unit": "retain calls"},
        {"step": 8, "name": "Reflection", "count": ops.get("reflect", 0), "unit": "reflections · " + str(len(lessons)) + " lessons"},
        {"step": 9, "name": "Future improvement", "count": sum(1 for l in lessons if l["confidence"] >= 0.7), "unit": "lessons now used in premortems"},
    ]
    return {"team": team, "steps": steps, "events": events[:40], "lessons": lessons, "memory_mode": memory.mode,
            "note": "NEXUS does not retrain the LLM. Recommendations improve because every confirmed outcome is retained "
                    "in Hindsight and recalled, and lesson confidence is recomputed from the accumulated outcomes."}


# ============================================================================ Scorecard
def scorecard(team: str) -> dict:
    decisions = store.list_records("decision", team)
    incs = store.list_records("incident", team)
    closed = [d for d in decisions if d.get("status") == "closed"]
    q = lambda d: f"{d[:4]} Q{(int(d[5:7]) - 1) // 3 + 1}" if d and len(d) >= 7 else "?"  # noqa: E731

    def trend(items, fn):
        b = defaultdict(list)
        for it, d in items:
            b[q(d)].append(it)
        return [{"period": k, "value": fn(v), "n": len(v)} for k, v in sorted(b.items())]

    metrics = []
    # 1 outcome recording rate
    metrics.append({"id": "outcome_rate", "name": "Decision outcome recording rate", "unit": "%",
                    "value": round(100 * len(closed) / len(decisions), 1) if decisions else None,
                    "explanation": "Decisions with a recorded outcome ÷ all decisions.",
                    "trend": trend([(d, d["proposed_at"]) for d in decisions], lambda v: round(100 * sum(x.get("status") == "closed" for x in v) / len(v), 1)),
                    "records": [d["id"] for d in decisions if d.get("status") != "closed"], "records_label": "decisions without outcome",
                    "completeness": 100.0 if decisions else 0})
    # 2 incident-to-decision linkage
    metrics.append({"id": "linkage", "name": "Incident-to-decision linkage rate", "unit": "%",
                    "value": round(100 * sum(1 for i in incs if i.get("linked_decision")) / len(incs), 1) if incs else None,
                    "explanation": "Incidents traced back to an engineering decision ÷ all incidents.",
                    "trend": trend([(i, i["date"]) for i in incs], lambda v: round(100 * sum(1 for x in v if x.get("linked_decision")) / len(v), 1)),
                    "records": [i["id"] for i in incs if i.get("linked_decision")], "records_label": "linked incidents",
                    "completeness": round(100 * sum(1 for i in incs if i.get("root_cause")) / len(incs), 1) if incs else 0})
    # 3 assumption failure frequency
    evald = [(a, d["closed_at"]) for d in closed for a in d["assumptions"] if a.get("held") is not None]
    metrics.append({"id": "assumption_failure", "name": "Assumption failure frequency", "unit": "%",
                    "value": round(100 * sum(1 for a, _ in evald if a["held"] is False) / len(evald), 1) if evald else None,
                    "explanation": "Assumptions that broke ÷ assumptions whose result was recorded.",
                    "trend": trend(evald, lambda v: round(100 * sum(1 for a in v if a["held"] is False) / len(v), 1)),
                    "records": sorted({d["id"] for d in closed for a in d["assumptions"] if a.get("held") is False}), "records_label": "decisions with a broken assumption",
                    "completeness": round(100 * sum(1 for d in closed if d["assumptions"]) / len(closed), 1) if closed else 0})
    # 4 temporary fix recurrence
    att = [(f, i["date"]) for i in incs for f in i["attempted_fixes"]]
    metrics.append({"id": "temporary_fix", "name": "Temporary fix recurrence rate", "unit": "%",
                    "value": round(100 * sum(1 for f, _ in att if f["result"] == "temporary") / len(att), 1) if att else None,
                    "explanation": "Fix attempts that only worked temporarily ÷ all recorded fix attempts.",
                    "trend": trend(att, lambda v: round(100 * sum(1 for f in v if f["result"] == "temporary") / len(v), 1)),
                    "records": [i["id"] for i in incs if any(f["result"] == "temporary" for f in i["attempted_fixes"])], "records_label": "incidents with a temporary fix",
                    "completeness": round(100 * sum(1 for i in incs if i["attempted_fixes"]) / len(incs), 1) if incs else 0})
    # 5 prediction calibration
    curve = A.calibration_curve(team)
    last = curve[-6:]
    metrics.append({"id": "calibration", "name": "Prediction calibration (mean estimate error)", "unit": "%",
                    "value": round(st.mean(p["nexus_error_pct"] for p in last), 1) if last else None, "lower_is_better": True,
                    "explanation": "Mean |actual − NEXUS-corrected estimate| ÷ actual over the last 6 closed decisions, each predicted using only earlier memories. "
                                   f"Raw team estimates over the same decisions: {round(st.mean(p['raw_error_pct'] for p in last), 1) if last else '—'}%.",
                    "trend": [{"period": p["id"], "value": p["nexus_rolling"], "n": p["history_size"]} for p in curve],
                    "records": [p["id"] for p in last], "records_label": "decisions measured",
                    "completeness": round(100 * len(closed) / len(decisions), 1) if decisions else 0})
    # 6 evidence-supported lessons
    lessons = A.lessons(team)
    strong = [l for l in lessons if l["confidence"] >= 0.7 and len(l["history"]) >= 3]
    metrics.append({"id": "lessons", "name": "Evidence-supported lessons", "unit": "",
                    "value": len(strong), "explanation": "Lessons with ≥70% confidence backed by ≥3 recorded outcomes.",
                    "trend": [], "records": sorted({h["ref"] for l in strong for h in l["history"]}), "records_label": "supporting records",
                    "completeness": round(100 * len(strong) / len(lessons), 1) if lessons else 0, "detail": [l["lesson"] for l in strong]})
    # 7 memory coverage
    kn = knowledge(team)
    rows = kn["services"]
    covered = [r for r in rows if r["documented_resolutions"] or r["decisions"]]
    metrics.append({"id": "coverage", "name": "Historical memory coverage", "unit": "%",
                    "value": round(100 * len(covered) / len(rows), 1) if rows else None,
                    "explanation": "Services with at least one recorded decision or documented incident resolution ÷ all known services.",
                    "trend": [], "records": [r["service"] for r in rows if r not in covered], "records_label": "services with no memory",
                    "completeness": round(100 * sum(1 for r in rows if r["tier"]) / len(rows), 1) if rows else 0})
    # 8 unresolved knowledge gaps
    metrics.append({"id": "gaps", "name": "Unresolved knowledge gaps", "unit": "", "value": kn["metrics"]["unresolved_gaps"], "lower_is_better": True,
                    "explanation": "Open items from Knowledge Retention: undocumented decisions, missing root causes, missing runbooks, concentration and contested lessons.",
                    "trend": [], "records": sorted({r for g in kn["gaps"] for r in g["refs"]})[:20], "records_label": "records involved",
                    "completeness": kn["metrics"]["documentation_completeness"]})
    return {"team": team, "generated": date.today().isoformat(), "metrics": metrics,
            "note": "All values are computed from stored records (illustrative seed data plus anything logged in NEXUS). No improvement percentages are estimated."}
