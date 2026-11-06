"""
Deterministic analytics over the structured history.

The LLM is good at phrasing; it is bad at arithmetic. Everything numeric that NEXUS
shows (calibration factors, corrected estimates, break rates, fix decay, lesson
confidence) is computed here, and only ever from records dated *before* the point
in time being analysed. That "as-of" discipline is what powers Decision Replay and
the learning curve.
"""
from __future__ import annotations

import re
import statistics as st
from collections import defaultdict

from . import store

STOP = set("""a an the of to for in on is are be by with and or as it its this that from we our will can
needed need via into at all any per new no not""".split())


def tokens(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", (s or "").lower()) if w not in STOP and len(w) > 2}


def _jac(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    return len(ta & tb) / len(ta | tb) if ta and tb else 0.0


def _core(s: str) -> str:
    """The claim before any justification: 'No schema changes needed; ORM abstracts it' -> 'No schema changes needed'."""
    return re.split(r"[;:(]| because | since ", s or "", maxsplit=1)[0]


def sim(a: str, b: str) -> float:
    return max(_jac(a, b), _jac(_core(a), _core(b)))


def closed_decisions(team: str, before: str | None = None) -> list[dict]:
    ds = [d for d in store.list_records("decision", team) if d.get("status") == "closed" and d.get("actual_weeks")]
    if before:
        ds = [d for d in ds if (d.get("closed_at") or "") < before]
    return sorted(ds, key=lambda d: d.get("closed_at") or "")


def incidents(team: str, before: str | None = None) -> list[dict]:
    xs = store.list_records("incident", team)
    if before:
        xs = [x for x in xs if (x.get("date") or "") < before]
    return xs


def ratio(d: dict) -> float:
    return d["actual_weeks"] / d["estimate_weeks"] if d.get("estimate_weeks") else 1.0


# ----------------------------------------------------------------------------- 6. calibration
def calibration(team: str, before: str | None = None) -> dict:
    ds = closed_decisions(team, before)
    by_cat = defaultdict(list)
    for d in ds:
        by_cat[d["category"]].append(d)
    cats = []
    for cat, items in by_cat.items():
        rs = [ratio(d) for d in items]
        cats.append({"category": cat, "n": len(items), "mean_ratio": round(st.mean(rs), 2),
                     "min_ratio": round(min(rs), 2), "max_ratio": round(max(rs), 2),
                     "decisions": [d["id"] for d in items]})
    cats.sort(key=lambda c: -c["mean_ratio"])
    overall = round(st.mean([ratio(d) for d in ds]), 2) if ds else None
    return {"team": team, "overall_ratio": overall, "n": len(ds), "categories": cats}


def corrected_estimate(team: str, category: str, estimate: float | None, before: str | None = None) -> dict | None:
    """Shrink the category factor toward the team-wide factor when the category has little history."""
    ds = closed_decisions(team, before)
    if not ds or not estimate:
        return None
    overall = st.mean([ratio(d) for d in ds])
    cat = [ratio(d) for d in ds if d["category"] == category]
    k = 2.0
    factor = (sum(cat) + k * overall) / (len(cat) + k)
    lo, hi = (min(cat), max(cat)) if len(cat) >= 2 else (max(1.0, factor * 0.8), factor * 1.25)
    lo, hi = min(lo, factor), max(hi, factor)
    return {
        "category": category, "raw_estimate_weeks": estimate, "factor": round(factor, 2),
        "corrected_weeks": round(estimate * factor, 1),
        "range_weeks": [round(estimate * lo, 1), round(estimate * hi, 1)],
        "based_on": [d["id"] for d in ds if d["category"] == category],
        "category_history": len(cat), "team_factor": round(overall, 2),
        "confidence": "high" if len(cat) >= 3 else "medium" if len(cat) >= 1 else "low (no history in this category)",
    }


# ----------------------------------------------------------------------------- 9. calibration curve
def calibration_curve(team: str) -> list[dict]:
    """For each closed decision, compare the raw estimate error with the error NEXUS would have had,
    using only memories available at proposal time. The gap is the learning curve."""
    pts = []
    for d in closed_decisions(team):
        prior = corrected_estimate(team, d["category"], d["estimate_weeks"], before=d["proposed_at"])
        raw_err = abs(d["actual_weeks"] - d["estimate_weeks"]) / d["actual_weeks"] * 100
        nexus_err = abs(d["actual_weeks"] - prior["corrected_weeks"]) / d["actual_weeks"] * 100 if prior else raw_err
        pts.append({"id": d["id"], "date": d["closed_at"], "title": d["title"], "category": d["category"],
                    "raw_error_pct": round(raw_err, 1), "nexus_error_pct": round(nexus_err, 1),
                    "history_size": len(closed_decisions(team, d["proposed_at"]))})
    # rolling means make the trend readable
    for i, p in enumerate(pts):
        w = pts[max(0, i - 3): i + 1]
        p["raw_rolling"] = round(st.mean(x["raw_error_pct"] for x in w), 1)
        p["nexus_rolling"] = round(st.mean(x["nexus_error_pct"] for x in w), 1)
    return pts


# ----------------------------------------------------------------------------- 7. assumption graveyard
def assumption_graveyard(team: str, before: str | None = None, threshold: float = 0.3) -> list[dict]:
    clusters: list[dict] = []
    for d in closed_decisions(team, before):
        for a in d.get("assumptions", []):
            best = max(clusters, key=lambda c: sim(c["assumption"], a["text"]), default=None)
            if best and sim(best["assumption"], a["text"]) >= threshold:
                c = best
            else:
                c = {"assumption": _core(a["text"]).strip(), "times_made": 0, "times_broke": 0, "decisions": [], "evidence": []}
                clusters.append(c)
            c["times_made"] += 1
            c["decisions"].append(d["id"])
            if not a.get("held"):
                c["times_broke"] += 1
                c["evidence"].append({"decision": d["id"], "title": d["title"], "note": a.get("note", ""),
                                      "date": d.get("closed_at")})
    for c in clusters:
        c["break_rate"] = round(c["times_broke"] / c["times_made"], 2)
    graveyard = [c for c in clusters if c["times_broke"] > 0]
    graveyard.sort(key=lambda c: (-c["times_broke"], -c["break_rate"]))
    return graveyard


def match_assumptions(team: str, assumptions: list[str], before: str | None = None) -> list[dict]:
    yard = assumption_graveyard(team, before)
    hits = []
    for a in assumptions:
        best = max(yard, key=lambda c: sim(c["assumption"], a), default=None)
        if best and sim(best["assumption"], a) >= 0.22:
            hits.append({"new_assumption": a, "match": best, "similarity": round(sim(best["assumption"], a), 2)})
    return hits


# ----------------------------------------------------------------------------- 8. ignored warnings
def ignored_warnings(team: str, before: str | None = None) -> dict:
    people = defaultdict(lambda: {"raised": 0, "ignored": 0, "ignored_then_materialized": 0, "addressed": 0, "items": []})
    items = []
    for d in closed_decisions(team, before):
        for r in d.get("risks", []):
            p = people[r["raised_by"]]
            p["raised"] += 1
            p["addressed"] += 1 if r["addressed"] else 0
            if not r["addressed"]:
                p["ignored"] += 1
                if r["materialized"]:
                    p["ignored_then_materialized"] += 1
                item = {"decision": d["id"], "title": d["title"], "raised_by": r["raised_by"], "risk": r["text"],
                        "materialized": r["materialized"], "incidents": d.get("linked_incidents", []),
                        "date": d.get("proposed_at"), "services": d.get("services", []), "category": d["category"]}
                items.append(item)
                p["items"].append(item)
    out = []
    for name, p in people.items():
        p["name"] = name
        p["hit_rate_when_ignored"] = round(p["ignored_then_materialized"] / p["ignored"], 2) if p["ignored"] else None
        out.append(p)
    out.sort(key=lambda p: -(p["ignored_then_materialized"]))
    return {"people": out, "items": items}


def relevant_ignored(team: str, text: str, services: list[str], category: str, before: str | None = None) -> list[dict]:
    hits = []
    for it in ignored_warnings(team, before)["items"]:
        score = sim(it["risk"], text) + (0.3 if set(services) & set(it["services"]) else 0) + \
                (0.2 if it["category"] == category else 0) + (0.2 if it["materialized"] else 0)
        if score >= 0.35:
            hits.append(dict(it, relevance=round(score, 2)))
    hits.sort(key=lambda x: -x["relevance"])
    return hits[:4]


# ----------------------------------------------------------------------------- 10. lesson evolution
def _beta(conf: int, n: int) -> float:
    return round((conf + 1) / (n + 2), 2)


def lessons(team: str) -> list[dict]:
    """Lessons are hypotheses whose confidence moves as outcomes arrive (Beta(1,1) prior)."""
    ds = closed_decisions(team)
    out = []
    # (a) category overrun lessons
    for cat in sorted({d["category"] for d in ds}):
        hist, c, n = [], 0, 0
        for d in ds:
            if d["category"] != cat:
                continue
            n += 1
            hit = ratio(d) >= 1.5
            c += hit
            hist.append({"date": d["closed_at"], "ref": d["id"], "event": "confirmed" if hit else "contradicted",
                         "detail": f"{ratio(d):.1f}x estimate", "confidence": _beta(c, n)})
        if n >= 2:
            rs = [ratio(d) for d in ds if d["category"] == cat]
            out.append({"id": f"L-cat-{cat}", "kind": "estimation",
                        "lesson": f"{cat.capitalize()} work runs ~{st.mean(rs):.1f}x over its estimate",
                        "confidence": hist[-1]["confidence"], "history": hist})
    # (b) assumption lessons
    for g in assumption_graveyard(team):
        if g["times_made"] < 2:
            continue
        hist, c, n = [], 0, 0
        for d in ds:
            for a in d.get("assumptions", []):
                if sim(a["text"], g["assumption"]) >= 0.3:
                    n += 1
                    c += not a["held"]
                    hist.append({"date": d["closed_at"], "ref": d["id"], "event": "confirmed" if not a["held"] else "contradicted",
                                 "detail": a.get("note") or "assumption held", "confidence": _beta(c, n)})
        out.append({"id": f"L-asm-{abs(hash(g['assumption'])) % 10000}", "kind": "assumption",
                    "lesson": f"Don't trust \"{g['assumption']}\" without a spike", "confidence": hist[-1]["confidence"],
                    "history": hist})
    # (c) people whose ignored warnings come true
    for p in ignored_warnings(team)["people"]:
        if p["ignored"] < 2:
            continue
        hist, c, n = [], 0, 0
        for it in p["items"]:
            n += 1
            c += it["materialized"]
            hist.append({"date": it["date"], "ref": it["decision"], "event": "confirmed" if it["materialized"] else "contradicted",
                         "detail": it["risk"], "confidence": _beta(c, n)})
        out.append({"id": f"L-person-{p['name'].split()[0].lower()}", "kind": "people",
                    "lesson": f"When {p['name']} flags a risk and it's ignored, it usually happens",
                    "confidence": hist[-1]["confidence"], "history": hist})
    # (d) temporary-fix lessons from incidents
    for f in fix_stats(team, None, None)["fixes"]:
        if f["temporary"] >= 2:
            hist, c, n = [], 0, 0
            for ev in f["events"]:
                n += 1
                c += ev["result"] == "temporary" or ev["result"] == "failed"
                hist.append({"date": ev["date"], "ref": ev["incident"], "event": "confirmed" if ev["result"] != "resolved" else "contradicted",
                             "detail": f"{ev['result']}" + (f", lasted {ev['lasted_days']}d" if ev.get('lasted_days') is not None else ""),
                             "confidence": _beta(c, n)})
            out.append({"id": f"L-fix-{abs(hash(f['action'])) % 10000}", "kind": "fix",
                        "lesson": f"\"{f['action']}\" only buys time (avg {f['avg_lasted_days']} days)",
                        "confidence": hist[-1]["confidence"], "history": hist})
    out.sort(key=lambda l: -l["confidence"])
    return out


# ----------------------------------------------------------------------------- RECALL-X: fix decay
def similar_incidents(team: str, service: str | None, text: str | None, before: str | None = None) -> list[dict]:
    res = []
    for i in incidents(team, before):
        s = 0.0
        if service and i["service"] == service:
            s += 0.5
        if text:
            s += sim(text, i["error_signature"] + " " + i["title"] + " " + " ".join(i["symptoms"])) * 1.5
        if s >= 0.35:
            res.append(dict(i, similarity=round(s, 2)))
    res.sort(key=lambda x: -x["similarity"])
    return res


def fix_stats(team: str, service: str | None, text: str | None, before: str | None = None) -> dict:
    pool = similar_incidents(team, service, text, before) if (service or text) else incidents(team, before)
    clusters: list[dict] = []
    for i in sorted(pool, key=lambda x: x.get("date") or ""):
        for f in i["attempted_fixes"]:
            best = max(clusters, key=lambda c: sim(c["action"], f["action"]), default=None)
            if best and sim(best["action"], f["action"]) >= 0.3:
                c = best
            else:
                c = {"action": f["action"], "tried": 0, "temporary": 0, "failed": 0, "resolved": 0, "lasted": [], "events": []}
                clusters.append(c)
            c["tried"] += 1
            c[f["result"]] += 1
            if f["result"] == "temporary" and f.get("lasted_days") is not None:
                c["lasted"].append(f["lasted_days"])
            c["events"].append({"incident": i["id"], "action": f["action"], "date": i.get("date"), "result": f["result"],
                                "lasted_days": f.get("lasted_days")})
    for c in clusters:
        names = [e["action"] for e in c["events"]]
        c["action"] = max(set(names), key=names.count)
        c["avg_lasted_days"] = round(st.mean(c["lasted"]), 1) if c["lasted"] else None
        c["success_rate"] = round(c["resolved"] / c["tried"], 2)
        c["verdict"] = ("works" if c["success_rate"] >= 0.6 else
                        "temporary only" if c["temporary"] >= max(c["failed"], 1) else "does not work")
        c.pop("lasted")
    clusters.sort(key=lambda c: (-c["success_rate"], -c["tried"]))
    return {"incidents": [x["id"] for x in pool], "fixes": clusters}


# ----------------------------------------------------------------------------- 11. Decision DNA graph
def graph(team: str) -> dict:
    nodes, edges = {}, []

    def node(nid, label, kind, **kw):
        nodes.setdefault(nid, {"id": nid, "label": label, "kind": kind, **kw})

    for d in store.list_records("decision", team):
        r = ratio(d) if d.get("actual_weeks") else None
        node(d["id"], d["title"], "decision", ratio=round(r, 2) if r else None, category=d["category"])
        node("p:" + d["owner"], d["owner"], "person")
        edges.append({"source": "p:" + d["owner"], "target": d["id"], "kind": "owns"})
        for s in d.get("services", []):
            node("s:" + s, s, "service")
            edges.append({"source": d["id"], "target": "s:" + s, "kind": "touches"})
        for r_ in d.get("risks", []):
            node("p:" + r_["raised_by"], r_["raised_by"], "person")
            if not r_["addressed"]:
                edges.append({"source": "p:" + r_["raised_by"], "target": d["id"], "kind": "warning ignored"})
    for g in assumption_graveyard(team):
        if g["times_broke"] >= 1:
            aid = "a:" + g["assumption"][:40]
            node(aid, g["assumption"], "assumption", broke=g["times_broke"])
            for e in g["evidence"]:
                edges.append({"source": aid, "target": e["decision"], "kind": "broke in"})
    for i in store.list_records("incident", team):
        node(i["id"], i["title"], "incident", ttr=i.get("ttr_minutes"))
        node("s:" + i["service"], i["service"], "service")
        edges.append({"source": i["id"], "target": "s:" + i["service"], "kind": "hit"})
        if i.get("linked_decision") and i["linked_decision"] in nodes:
            edges.append({"source": i["linked_decision"], "target": i["id"], "kind": "caused"})
    return {"nodes": list(nodes.values()), "edges": edges}


# ----------------------------------------------------------------------------- 13. team comparison
def team_profile(team: str) -> dict:
    cal = calibration(team)
    yard = assumption_graveyard(team)
    ign = ignored_warnings(team)
    incs = incidents(team)
    fixes = fix_stats(team, None, None)["fixes"]
    tried = sum(f["tried"] for f in fixes) or 1
    return {
        "team": team,
        "decisions": cal["n"],
        "overall_ratio": cal["overall_ratio"],
        "worst_category": cal["categories"][0] if cal["categories"] else None,
        "best_category": cal["categories"][-1] if cal["categories"] else None,
        "top_broken_assumption": yard[0] if yard else None,
        "ignored_warnings": len(ign["items"]),
        "ignored_that_materialized": sum(1 for x in ign["items"] if x["materialized"]),
        "incidents": len(incs),
        "decision_caused_incidents": sum(1 for i in incs if i.get("linked_decision")),
        "avg_ttr_minutes": round(st.mean([i["ttr_minutes"] for i in incs if i.get("ttr_minutes")]), 0) if incs else None,
        "temporary_fix_rate": round(sum(f["temporary"] for f in fixes) / tried, 2),
        "categories": cal["categories"],
    }


# ----------------------------------------------------------------------------- risk scoring
def risk_level(score: float) -> str:
    return "critical" if score >= 70 else "high" if score >= 50 else "medium" if score >= 30 else "low"


def predict_risk(team: str, d: dict, as_of: str | None = None, exclude: str | None = None) -> dict:
    """0-100 risk score for a decision, from history available at `as_of` only.
    Same signals the premortem warns on, so the table and the report always agree."""
    factors = []
    cat, services = d.get("category", "feature"), d.get("services") or []
    assumptions = [a if isinstance(a, str) else a.get("text", "") for a in d.get("assumptions") or []]
    corr = corrected_estimate(team, cat, d.get("estimate_weeks"), before=as_of)
    if corr and corr["factor"] > 1.1:
        factors.append({"label": f"{cat} work runs {corr['factor']}x over estimate", "points": round(min(35, (corr["factor"] - 1) * 30))})
    for h in match_assumptions(team, assumptions, before=as_of):
        factors.append({"label": f"assumption broke before: {h['match']['assumption']}",
                        "points": round(min(15, 15 * h["match"]["break_rate"]))})
    text = f"{d.get('title', '')} {' '.join(assumptions)} rollback"
    for iw in relevant_ignored(team, text, services, cat, before=as_of)[:2]:
        if iw["decision"] != exclude:
            factors.append({"label": f"{iw['raised_by']}'s ignored warning on {iw['decision']}", "points": 10 if iw["materialized"] else 5})
    linked = [x for x in closed_decisions(team, as_of)
              if x["id"] != exclude and x.get("linked_incidents") and set(x.get("services", [])) & set(services)]
    if linked:
        n = sum(len(x["linked_incidents"]) for x in linked)
        factors.append({"label": f"similar decisions caused {n} incident(s)", "points": min(15, 5 * n)})
    score = min(100, sum(f["points"] for f in factors))
    return {"score": score, "level": risk_level(score), "factors": factors}


# ----------------------------------------------------------------------------- fix check
def check_fix(team: str, service: str | None, action: str) -> dict:
    stats = fix_stats(team, service, None) if service else fix_stats(team, None, None)
    matches = [dict(f, similarity=round(sim(f["action"], action), 2)) for f in stats["fixes"] if sim(f["action"], action) >= 0.3]
    matches.sort(key=lambda f: -f["similarity"])
    bad = [m for m in matches if m["verdict"] != "works"]
    return {"action": action, "matches": matches[:3], "warning": bool(bad),
            "message": (f"\"{bad[0]['action']}\" was tried {bad[0]['tried']}x on similar incidents: "
                        f"{bad[0]['failed']} failed, {bad[0]['temporary']} only temporary"
                        + (f" (lasted ~{bad[0]['avg_lasted_days']} days)" if bad[0]['avg_lasted_days'] is not None else "")
                        + f", {bad[0]['resolved']} resolved.") if bad else
                       (f"Resolved {matches[0]['resolved']}/{matches[0]['tried']} similar incidents." if matches else
                        "No record of this fix being tried before.")}
