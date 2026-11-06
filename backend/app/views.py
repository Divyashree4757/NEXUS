"""Read-model aggregations for the dashboard pages. Pure functions over the record store + analytics."""
from __future__ import annotations

import statistics as st
from collections import Counter, defaultdict

from . import analytics as A
from . import config, store
from .memory import memory


def _quarter(d: str) -> str:
    return f"{d[:4]} Q{(int(d[5:7]) - 1) // 3 + 1}" if d and len(d) >= 7 else "unknown"


def all_incidents(team: str) -> list[dict]:
    return store.list_records("incident", team) + store.list_records("incident_open", team)


def decisions(team: str) -> list[dict]:
    out = []
    for d in store.list_records("decision", team):
        risk = A.predict_risk(team, d, as_of=d.get("proposed_at"), exclude=d["id"])
        out.append({**d, "predicted_risk": risk,
                    "ratio": round(A.ratio(d), 2) if d.get("actual_weeks") else None})
    out.sort(key=lambda d: d.get("proposed_at") or "", reverse=True)
    return out


def incidents(team: str) -> list[dict]:
    out = []
    for i in all_incidents(team):
        sim = [x for x in A.similar_incidents(team, i["service"], f"{i['error_signature']} {i['title']}", before=i.get("date"))
               if x["id"] != i["id"]]
        out.append({**i, "similar_ids": [x["id"] for x in sim[:5]], "similar_count": len(sim),
                    "recurring": len(sim) > 0, "severity": i.get("severity", "SEV3")})
    out.sort(key=lambda x: x.get("date") or "", reverse=True)
    return out


def overview(team: str) -> dict:
    ds, incs = decisions(team), incidents(team)
    closed = [d for d in ds if d.get("status") == "closed"]
    curve = A.calibration_curve(team)
    last = curve[-6:]
    lessons = A.lessons(team)
    patterns = [l for l in lessons if l["confidence"] >= 0.7]
    risks_found = sum(len(d["predicted_risk"]["factors"]) for d in ds)
    # activity timeline
    events = []
    for d in ds:
        events.append({"at": d["proposed_at"], "kind": "decision", "ref": d["id"], "title": d["title"],
                       "detail": f"{d['category']} · est. {d.get('estimate_weeks')}w · risk {d['predicted_risk']['score']}"})
        if d.get("closed_at"):
            events.append({"at": d["closed_at"], "kind": "shipped", "ref": d["id"], "title": d["title"],
                           "detail": f"shipped in {d['actual_weeks']}w ({d['ratio']}x estimate)"})
    for i in incs:
        events.append({"at": i["date"], "kind": "incident", "ref": i["id"], "title": i["title"],
                       "detail": f"{i['severity']} · {i['service']}"})
        if i.get("status") == "resolved":
            events.append({"at": i["date"], "kind": "resolved", "ref": i["id"], "title": i["title"],
                           "detail": f"resolved in {i.get('ttr_minutes') or '?'} min"})
    events.sort(key=lambda e: (e["at"], e["kind"] == "resolved"), reverse=True)
    # incident trend by quarter, split by severity
    trend = defaultdict(Counter)
    for i in incs:
        trend[_quarter(i["date"])][i["severity"]] += 1
    quarters = sorted(trend)
    risk_dist = Counter(d["predicted_risk"]["level"] for d in ds)
    open_risks = sorted([d for d in ds if d.get("status") == "open"], key=lambda d: -d["predicted_risk"]["score"])
    return {
        "team": team,
        "metrics": {
            "decisions": len(ds), "open_decisions": len(ds) - len(closed),
            "incidents": len(incs), "resolved_incidents": sum(1 for i in incs if i.get("status") == "resolved"),
            "risks_identified": risks_found, "high_risk_decisions": sum(1 for d in ds if d["predicted_risk"]["level"] in ("high", "critical")),
            "recurring_patterns": len(patterns),
            "prediction_accuracy": round(100 - st.mean(p["nexus_error_pct"] for p in last), 1) if last else None,
            "team_accuracy": round(100 - st.mean(p["raw_error_pct"] for p in last), 1) if last else None,
        },
        "activity": events[:14],
        "risk_distribution": [{"level": l, "count": risk_dist.get(l, 0)} for l in ("critical", "high", "medium", "low")],
        "top_risks": [{"id": d["id"], "title": d["title"], **d["predicted_risk"]} for d in (open_risks or sorted(ds, key=lambda d: -d["predicted_risk"]["score"]))[:4]],
        "decision_vs_actual": [{"id": d["id"], "title": d["title"], "estimate": d["estimate_weeks"], "actual": d["actual_weeks"]}
                               for d in sorted(closed, key=lambda d: d["closed_at"])[-10:]],
        "incident_trend": [{"quarter": q, **{s: trend[q].get(s, 0) for s in ("SEV1", "SEV2", "SEV3")},
                            "total": sum(trend[q].values())} for q in quarters],
        "blind_spots": [{"lesson": l["lesson"], "kind": l["kind"], "confidence": l["confidence"], "observations": len(l["history"]),
                         "refs": [h["ref"] for h in l["history"]][-4:]} for l in lessons[:6]],
        "insights": [o for o in store.ops(team, 60) if o["op"] in ("reflect", "recall")][:6],
        "memory_mode": memory.mode,
    }


def services(team: str) -> list[dict]:
    rows = defaultdict(lambda: {"decisions": [], "incidents": [], "fixes": Counter()})
    for d in store.list_records("decision", team):
        for s in d.get("services", []):
            rows[s]["decisions"].append(d)
    for i in all_incidents(team):
        rows[i["service"]]["incidents"].append(i)
        for f in i.get("attempted_fixes", []):
            rows[i["service"]]["fixes"][f["result"]] += 1
    out = []
    for name, r in rows.items():
        closed = [d for d in r["decisions"] if d.get("actual_weeks")]
        tried = sum(r["fixes"].values())
        out.append({"service": name, "decisions": len(r["decisions"]), "incidents": len(r["incidents"]),
                    "sev1": sum(1 for i in r["incidents"] if i.get("severity") == "SEV1"),
                    "avg_overrun": round(st.mean(A.ratio(d) for d in closed), 2) if closed else None,
                    "temporary_fix_rate": round(r["fixes"]["temporary"] / tried, 2) if tried else None,
                    "last_incident": max((i["date"] for i in r["incidents"]), default=None),
                    "decision_ids": [d["id"] for d in r["decisions"]], "incident_ids": [i["id"] for i in r["incidents"]]})
    out.sort(key=lambda x: (-x["incidents"], -x["decisions"]))
    return out


def projects(team: str) -> list[dict]:
    ds = decisions(team)
    by = defaultdict(list)
    for d in ds:
        by[d.get("project") or "General"].append(d)
    out = []
    for name, items in by.items():
        closed = [d for d in items if d.get("actual_weeks")]
        incs = [i for d in items for i in d.get("linked_incidents", [])]
        out.append({"project": name, "decisions": len(items), "open": len(items) - len(closed),
                    "estimate_weeks": sum(d.get("estimate_weeks") or 0 for d in items),
                    "actual_weeks": sum(d.get("actual_weeks") or 0 for d in closed),
                    "avg_ratio": round(st.mean(A.ratio(d) for d in closed), 2) if closed else None,
                    "incidents": incs, "max_risk": max(d["predicted_risk"]["score"] for d in items),
                    "services": sorted({s for d in items for s in d.get("services", [])}),
                    "owners": sorted({d.get("owner") for d in items if d.get("owner")}),
                    "decision_ids": [d["id"] for d in items]})
    out.sort(key=lambda p: -p["max_risk"])
    return out


def analytics(team: str) -> dict:
    ds = decisions(team)
    closed = sorted([d for d in ds if d.get("actual_weeks")], key=lambda d: d["closed_at"])
    incs = incidents(team)
    by_svc = defaultdict(lambda: [0, 0])
    for i in incs:
        by_svc[i["service"]][0] += 1
        by_svc[i["service"]][1] += 1 if i["recurring"] else 0
    fixes = Counter()
    for i in incs:
        for f in i.get("attempted_fixes", []):
            fixes[f["result"]] += 1
    return {
        "estimate_vs_actual": [{"id": d["id"], "title": d["title"], "category": d["category"], "estimate": d["estimate_weeks"],
                                "actual": d["actual_weeks"], "ratio": d["ratio"]} for d in closed],
        "accuracy_curve": A.calibration_curve(team),
        "recurrence": [{"service": s, "incidents": v[0], "recurring": v[1], "rate": round(v[1] / v[0], 2)} for s, v in by_svc.items()],
        "fix_outcomes": [{"result": r, "count": fixes.get(r, 0)} for r in ("resolved", "temporary", "failed")],
        "fix_stats": A.fix_stats(team, None, None)["fixes"],
        "risk_distribution": [{"level": l, "count": sum(1 for d in ds if d["predicted_risk"]["level"] == l)}
                              for l in ("critical", "high", "medium", "low")],
        "risk_vs_overrun": [{"id": d["id"], "risk": d["predicted_risk"]["score"], "ratio": d["ratio"], "title": d["title"]} for d in closed],
        "assumptions": A.assumption_graveyard(team),
        "calibration": A.calibration(team),
        "teams": [A.team_profile(t) for t in config.TEAMS],
    }


def memory_stats(team: str) -> dict:
    ds, incs = store.list_records("decision", team), all_incidents(team)
    closed = [d for d in ds if d.get("status") == "closed"]
    return {
        "mode": memory.mode, "bank": f"{config.BANK_PREFIX}-{team}",
        "retained": {"decisions": len(ds), "outcomes": len(closed),
                     "assumptions": sum(len(d.get("assumptions", [])) for d in ds),
                     "incidents": sum(1 for i in incs if i.get("status") == "resolved"),
                     "resolutions": sum(1 for i in incs for f in i.get("attempted_fixes", []) if f["result"] == "resolved")},
        "ops": store.op_counts(team),
        "patterns": len([l for l in A.lessons(team) if l["confidence"] >= 0.7]),
    }


def graph(team: str) -> dict:
    """Knowledge graph: decisions, projects, assumptions, incidents, root causes, fixes, outcomes, lessons."""
    nodes, edges = {}, []

    def node(nid, label, kind, **kw):
        nodes.setdefault(nid, {"id": nid, "label": label, "kind": kind, **kw})

    def edge(a, b, kind, why):
        edges.append({"source": a, "target": b, "kind": kind, "why": why})

    ds = store.list_records("decision", team)
    for d in ds:
        r = round(A.ratio(d), 2) if d.get("actual_weeks") else None
        node(d["id"], d["title"], "decision", ratio=r, category=d["category"], date=d.get("proposed_at"))
        pid = "proj:" + (d.get("project") or "General")
        node(pid, d.get("project") or "General", "project")
        edge(pid, d["id"], "contains", f"{d['id']} is part of {d.get('project')}")
        if r:
            oid = "out:" + d["id"]
            node(oid, f"{r}x estimate" + (" · incident" if d.get("linked_incidents") else ""), "outcome", ratio=r)
            edge(d["id"], oid, "resulted in", f"took {d['actual_weeks']}w vs {d['estimate_weeks']}w")
    for g in A.assumption_graveyard(team):
        aid = "asm:" + g["assumption"][:50]
        node(aid, g["assumption"], "assumption", broke=g["times_broke"], made=g["times_made"])
        for e in g["evidence"]:
            edge(aid, e["decision"], "failed in", f"broke: {e['note']}")
    # similar decisions (same category + shared service)
    for i, a in enumerate(ds):
        for b in ds[i + 1:]:
            if a["category"] == b["category"] and set(a.get("services", [])) & set(b.get("services", [])):
                edge(a["id"], b["id"], "similar to", f"both {a['category']} on {', '.join(set(a['services']) & set(b['services']))}")
    for inc in all_incidents(team):
        node(inc["id"], inc["title"], "incident", severity=inc.get("severity"), date=inc.get("date"))
        if inc.get("linked_decision"):
            node(inc["linked_decision"], inc["linked_decision"], "decision")
            edge(inc["linked_decision"], inc["id"], "caused", "incident traced back to this decision")
        if inc.get("root_cause"):
            rid = "rc:" + inc["id"]
            node(rid, inc["root_cause"], "root_cause")
            edge(inc["id"], rid, "root cause", inc["root_cause"])
        for f in inc.get("attempted_fixes", []):
            if f["result"] == "resolved":
                fid = "fix:" + f["action"][:40]
                node(fid, f["action"], "fix")
                edge(fid, inc["id"], "resolved", f"{f['action']} resolved {inc['id']}")
    for l in A.lessons(team)[:8]:
        lid = "les:" + l["id"]
        node(lid, l["lesson"], "lesson", confidence=l["confidence"])
        for h in l["history"][-4:]:
            if h["ref"] in nodes:
                edge(h["ref"], lid, "taught", f"{h['event']}: {h['detail']}")
    return {"nodes": list(nodes.values()), "edges": [e for e in edges if e["source"] in nodes and e["target"] in nodes]}
