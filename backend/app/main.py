"""NEXUS API — Engineering intelligence that learns, built on Hindsight memory."""
from __future__ import annotations

import logging
from datetime import date

from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import analytics as A
from . import config, intelligence, integrations, llm, store, views
from .agents import capture, premortem, recallx
from .memory import memory
from .seed import seed

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
app = FastAPI(title="NEXUS", version="1.0", description="PREMORTEM + RECALL-X on Hindsight memory")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


def _team(team: str) -> str:
    if team not in config.TEAMS:
        raise HTTPException(404, f"unknown team '{team}'. Known: {config.TEAMS}")
    return team


@app.on_event("shutdown")
def _shutdown():
    memory.close()


@app.on_event("startup")
def _startup():
    if memory.mode == "local-fallback" and store.list_records("decision"):
        _rehydrate_local()  # the fallback store lives in-process, so rebuild it from the record store
    if not store.list_records("decision"):
        logging.getLogger("nexus").info("empty store — seeding")
        try:
            seed(reset=False)
        except Exception as e:  # never block boot on seeding
            logging.getLogger("nexus").error("seed failed: %s", e)


def _rehydrate_local():
    from .memory import decision_tags, decision_text, incident_tags, incident_text, outcome_text
    for team in config.TEAMS:
        items = []
        for d in store.list_records("decision", team):
            items.append({"content": decision_text(d), "document_id": f"{d['id']}:proposal", "tags": decision_tags(d, "decision"),
                          "timestamp": d.get("proposed_at"), "context": "rehydrate"})
            if d.get("status") == "closed":
                items.append({"content": outcome_text(d), "document_id": f"{d['id']}:outcome", "tags": decision_tags(d, "outcome"),
                              "timestamp": d.get("closed_at"), "context": "rehydrate"})
        for i in store.list_records("incident", team):
            items.append({"content": incident_text(i), "document_id": f"{i['id']}:incident", "tags": incident_tags(i),
                          "timestamp": i.get("date"), "context": "rehydrate"})
        memory.retain_batch(team, items)


# ----------------------------------------------------------------------------- meta
@app.get("/health")
def health():
    return {"ok": True, "memory_mode": memory.mode, "memory_last_error": memory.last_error, "llm_mode": llm.mode, "model": config.GROQ_MODEL,
            "teams": config.TEAMS, "decisions": len(store.list_records("decision")),
            "incidents": len(store.list_records("incident"))}


@app.post("/admin/seed")
def admin_seed(reset: bool = True):
    return seed(reset=reset)


@app.get("/timeline")
def timeline(team: str):
    _team(team)
    items = [{"kind": "decision", **d} for d in store.list_records("decision", team)] + \
            [{"kind": "incident", **i} for i in store.list_records("incident", team)] + \
            [{"kind": "incident_open", **i} for i in store.list_records("incident_open", team)]
    items.sort(key=lambda x: x.get("proposed_at") or x.get("date") or "", reverse=True)
    return {"items": items, "events": store.events(team)[-50:]}


# ----------------------------------------------------------------------------- 1. capture
class CaptureIn(BaseModel):
    team: str
    text: str = Field(min_length=10)
    owner: str | None = None


@app.post("/decisions/capture")
def capture_decision(body: CaptureIn):
    _team(body.team)
    parsed = capture.extract(body.text)
    rec = {
        "id": store.next_id("D"), "team": body.team, "proposed_at": date.today().isoformat(), "closed_at": None,
        "title": parsed["title"], "category": parsed["category"], "owner": body.owner or parsed.get("owner") or "unknown",
        "services": parsed.get("services", []), "estimate_weeks": parsed.get("estimate_weeks"), "actual_weeks": None,
        "status": "open", "assumptions": [{"text": a, "held": None, "note": ""} for a in parsed.get("assumptions", [])],
        "risks": [{"raised_by": r.get("raised_by", "author"), "text": r.get("text", ""), "addressed": None, "materialized": None}
                  for r in parsed.get("risks", [])],
        "outcome_summary": "", "linked_incidents": [], "source_text": body.text,
    }
    store.upsert("decision", rec)
    memory.retain_decision(rec)
    store.log_event(body.team, "capture", rec["id"], rec["proposed_at"], {})
    return {"decision": rec, "parsed": parsed}


@app.get("/decisions")
def list_decisions(team: str):
    return views.decisions(_team(team))


class DecisionIn(BaseModel):
    team: str
    title: str = Field(min_length=3)
    project: str = "General"
    description: str = ""
    architecture: str = ""
    estimate_weeks: float = Field(gt=0)
    assumptions: list[str] = []
    risks: list[str] = []
    team_size: int = 3
    owner: str | None = None
    services: list[str] = []
    category: str | None = None


@app.post("/decisions")
def create_decision(body: DecisionIn):
    """Structured create from the New Decision form (feature 1). Category/services are extracted if not given."""
    _team(body.team)
    text = (f"{body.title}\nProject: {body.project}. Estimate: {body.estimate_weeks} weeks. Team size: {body.team_size}.\n"
            f"{body.description}\nArchitecture: {body.architecture}\nAssumptions:\n" + "\n".join(body.assumptions) +
            "\nRisks:\n" + "\n".join(body.risks))
    parsed = capture.extract(text) if not (body.category and body.services) else {}
    rec = {
        "id": store.next_id("D"), "team": body.team, "proposed_at": date.today().isoformat(), "closed_at": None,
        "title": body.title, "project": body.project, "team_size": body.team_size,
        "category": body.category or parsed.get("category", "feature"), "owner": body.owner or "you",
        "services": body.services or parsed.get("services", []), "estimate_weeks": body.estimate_weeks,
        "actual_weeks": None, "status": "open", "description": body.description, "architecture": body.architecture,
        "assumptions": [{"text": a, "held": None, "note": ""} for a in body.assumptions if a.strip()],
        "risks": [{"raised_by": body.owner or "author", "text": r, "addressed": None, "materialized": None} for r in body.risks if r.strip()],
        "outcome_summary": "", "linked_incidents": [], "source_text": text,
    }
    store.upsert("decision", rec)
    memory.retain_decision(rec)
    store.log_event(body.team, "capture", rec["id"], rec["proposed_at"], {})
    return rec


@app.get("/decisions/{did}")
def get_decision(did: str):
    d = store.get(did)
    if not d:
        raise HTTPException(404, "not found")
    return d


# ----------------------------------------------------------------------------- 2/4/5. premortem
class PremortemIn(BaseModel):
    team: str
    text: str | None = None
    decision_id: str | None = None
    compare: bool = True


@app.post("/premortem")
def run_premortem(body: PremortemIn):
    _team(body.team)
    parsed, text = None, body.text
    if body.decision_id:
        d = store.get(body.decision_id)
        if not d:
            raise HTTPException(404, "decision not found")
        text = d.get("source_text") or f"{d['title']}. Estimate {d['estimate_weeks']} weeks. Assumptions: " + \
            "; ".join(a["text"] for a in d["assumptions"])
        parsed = {"id": d["id"], "title": d["title"], "category": d["category"], "estimate_weeks": d["estimate_weeks"],
                  "services": d["services"], "assumptions": [a["text"] for a in d["assumptions"]],
                  "risks": d["risks"], "summary": d["title"]}
    if not text:
        raise HTTPException(422, "provide text or decision_id")
    parsed = parsed or capture.extract(text)
    with_mem = premortem.run(body.team, text, parsed=parsed, use_memory=True, exclude_id=body.decision_id)
    out = {"with_memory": with_mem}
    if body.compare:
        out["without_memory"] = premortem.run(body.team, text, parsed=parsed, use_memory=False)
    return out


# ----------------------------------------------------------------------------- 3. outcome logging
class AssumptionOut(BaseModel):
    text: str
    held: bool
    note: str = ""


class RiskOut(BaseModel):
    raised_by: str
    text: str
    addressed: bool
    materialized: bool


class OutcomeIn(BaseModel):
    actual_weeks: float
    assumptions: list[AssumptionOut] = []
    risks: list[RiskOut] = []
    outcome_summary: str = ""
    linked_incidents: list[str] = []
    closed_at: str | None = None


@app.post("/decisions/{did}/outcome")
def log_outcome(did: str, body: OutcomeIn):
    d = store.get(did)
    if not d:
        raise HTTPException(404, "decision not found")
    team = d["team"]
    cal_before = A.calibration(team)
    lessons_before = {l["id"]: l["confidence"] for l in A.lessons(team)}
    d.update({
        "actual_weeks": body.actual_weeks, "status": "closed", "closed_at": body.closed_at or date.today().isoformat(),
        "assumptions": [a.model_dump() for a in body.assumptions] or d["assumptions"],
        "risks": [r.model_dump() for r in body.risks] or d["risks"],
        "outcome_summary": body.outcome_summary, "linked_incidents": body.linked_incidents,
    })
    for a in d["assumptions"]:
        a["held"] = True if a.get("held") is None else a["held"]
    for r in d["risks"]:
        r["addressed"] = bool(r.get("addressed"))
        r["materialized"] = bool(r.get("materialized"))
    store.upsert("decision", d)
    memory.retain_outcome(d)
    store.log_event(team, "outcome", did, d["closed_at"], {"ratio": round(A.ratio(d), 2)})
    cal_after = A.calibration(team)
    lessons_after = A.lessons(team)
    changed = [{"lesson": l["lesson"], "before": lessons_before.get(l["id"]), "after": l["confidence"]}
               for l in lessons_after if lessons_before.get(l["id"]) != l["confidence"]]
    cat = lambda cal: next((c for c in cal["categories"] if c["category"] == d["category"]), None)  # noqa: E731
    return {"decision": d, "learning": {"category": d["category"], "factor_before": (cat(cal_before) or {}).get("mean_ratio"),
                                        "factor_after": (cat(cal_after) or {}).get("mean_ratio"),
                                        "team_before": cal_before["overall_ratio"], "team_after": cal_after["overall_ratio"],
                                        "lessons_changed": changed}}


# ----------------------------------------------------------------------------- 14. decision replay
@app.get("/replay/{did}")
def replay(did: str):
    d = store.get(did)
    if not d:
        raise HTTPException(404, "decision not found")
    parsed = {"id": d["id"], "title": d["title"], "category": d["category"], "estimate_weeks": d["estimate_weeks"],
              "services": d["services"], "assumptions": [a["text"] for a in d["assumptions"]], "risks": d["risks"],
              "summary": d["title"]}
    text = f"{d['title']}. Estimate {d['estimate_weeks']} weeks. Assumptions: " + "; ".join(parsed["assumptions"])
    rep = premortem.run(d["team"], text, parsed=parsed, as_of=d["proposed_at"], exclude_id=d["id"])
    actual = {"actual_weeks": d.get("actual_weeks"), "estimate_weeks": d.get("estimate_weeks"),
              "broken_assumptions": [a for a in d["assumptions"] if a.get("held") is False],
              "ignored_risks": [r for r in d["risks"] if r.get("addressed") is False],
              "incidents": d.get("linked_incidents", []), "outcome_summary": d.get("outcome_summary")}
    flagged = {w["type"] for w in rep["warnings"]}
    caught = []
    if "estimate" in flagged and d.get("actual_weeks") and d["actual_weeks"] / d["estimate_weeks"] >= 1.3:
        caught.append("estimate overrun")
    if "assumption" in flagged and actual["broken_assumptions"]:
        caught.append("broken assumption")
    if ("ignored_warning" in flagged or "incident_link" in flagged) and (actual["ignored_risks"] or actual["incidents"]):
        caught.append("ignored risk / incident")
    return {"decision": d, "nexus_at_the_time": rep, "what_actually_happened": actual, "would_have_caught": caught}


# ----------------------------------------------------------------------------- RECALL-X
class IncidentIn(BaseModel):
    team: str
    text: str = Field(min_length=5)
    service: str | None = None
    compare: bool = True


@app.post("/incidents/investigate")
def investigate(body: IncidentIn):
    _team(body.team)
    out = {"with_memory": recallx.run(body.team, body.text, body.service, use_memory=True)}
    if body.compare:
        out["without_memory"] = recallx.run(body.team, body.text, body.service, use_memory=False)
    return out


class FixIn(BaseModel):
    action: str
    result: str = Field(pattern="^(resolved|temporary|failed)$")
    lasted_days: float | None = None


class ResolveIn(BaseModel):
    attempted_fixes: list[FixIn]
    root_cause: str
    resolution: str
    linked_decision: str | None = None
    ttr_minutes: int | None = None


@app.post("/incidents/{iid}/resolve")
def resolve_incident(iid: str, body: ResolveIn):
    try:
        data = body.model_dump()
        data["attempted_fixes"] = [f.model_dump() for f in body.attempted_fixes]
        return recallx.resolve(iid, data)
    except KeyError:
        raise HTTPException(404, "incident not found")


@app.get("/incidents")
def list_incidents(team: str):
    return views.incidents(_team(team))


class IncidentCreate(BaseModel):
    team: str
    title: str = Field(min_length=3)
    service: str
    severity: str = Field("SEV2", pattern="^SEV[1-3]$")
    logs: list[str] = []
    symptoms: list[str] = []


@app.post("/incidents")
def create_incident(body: IncidentCreate):
    _team(body.team)
    return recallx.create(body.team, body.title, body.service, body.severity, body.logs, body.symptoms)


class FixCheckIn(BaseModel):
    team: str
    action: str = Field(min_length=3)
    service: str | None = None


@app.post("/incidents/check-fix")
def check_fix(body: FixCheckIn):
    return A.check_fix(_team(body.team), body.service, body.action)


@app.get("/incidents/{iid}")
def get_incident(iid: str):
    rec = store.get(iid)
    if not rec:
        raise HTTPException(404, "incident not found")
    return rec


@app.post("/incidents/{iid}/analyze")
def analyze_incident(iid: str, compare: bool = True):
    """Investigate an incident using only memories that existed before it (open incidents: all memory)."""
    rec = store.get(iid)
    if not rec:
        raise HTTPException(404, "incident not found")
    as_of = rec["date"] if rec.get("status") == "resolved" else None
    text = recallx.incident_text(rec)
    out = {"incident": rec, "with_memory": recallx.analyze(rec["team"], text, rec["service"], as_of=as_of, exclude=iid)}
    out["with_memory"]["conflicts"] = intelligence.conflicts(rec["team"], service=rec["service"], with_recall=False, before=as_of)
    if compare:
        out["without_memory"] = recallx.analyze(rec["team"], text, rec["service"], use_memory=False)
    return out


# ----------------------------------------------------------------------------- learning loop step 4: progress notes
class ProgressIn(BaseModel):
    note: str = Field(min_length=3)


@app.post("/decisions/{did}/progress")
def add_progress(did: str, body: ProgressIn):
    d = store.get(did)
    if not d:
        raise HTTPException(404, "decision not found")
    if d.get("status") != "open":
        raise HTTPException(409, "decision is already closed; log the outcome instead")
    at = date.today().isoformat()
    memory.retain_progress(d, body.note, at)
    d.setdefault("progress", []).append({"at": at, "note": body.note})
    store.upsert("decision", d)
    store.log_event(d["team"], "progress", did, at, {})
    return d


# ----------------------------------------------------------------------------- organisational intelligence
@app.get("/intelligence/dna")
def dna(team: str):
    return intelligence.decision_dna(_team(team))


@app.get("/intelligence/conflicts")
def list_conflicts(team: str, service: str | None = None):
    return intelligence.conflicts(_team(team), service=service)


class ConflictExplainIn(BaseModel):
    team: str
    conflict_id: str


@app.post("/intelligence/conflicts/explain")
def explain_conflict(body: ConflictExplainIn):
    out = intelligence.explain_conflict(_team(body.team), body.conflict_id)
    if out.get("error"):
        raise HTTPException(404, out["error"])
    return out


@app.get("/intelligence/propagation")
def propagation(team: str):
    return intelligence.propagation(_team(team))


class WhatIfIn(BaseModel):
    team: str
    original: str = Field(min_length=3)
    alternative: str = Field(min_length=3)
    description: str = ""
    workload: str = ""
    constraints: str = ""
    infrastructure: str = ""


@app.post("/intelligence/whatif")
def whatif(body: WhatIfIn):
    _team(body.team)
    return intelligence.whatif(body.team, body.model_dump())


@app.get("/intelligence/knowledge")
def knowledge(team: str):
    return intelligence.knowledge(_team(team))


@app.get("/intelligence/runbook")
def runbook(team: str, service: str):
    return intelligence.runbook_draft(_team(team), service)


@app.get("/intelligence/learning")
def learning(team: str):
    return intelligence.learning(_team(team))


@app.get("/intelligence/scorecard")
def scorecard(team: str):
    return intelligence.scorecard(_team(team))


# ----------------------------------------------------------------------------- dashboard read models
@app.get("/overview")
def overview(team: str):
    return views.overview(_team(team))


@app.get("/services")
def list_services(team: str):
    return views.services(_team(team))


@app.get("/projects")
def list_projects(team: str):
    return views.projects(_team(team))


@app.get("/analytics")
def analytics_bundle(team: str):
    return views.analytics(_team(team))


@app.get("/knowledge-graph")
def knowledge_graph(team: str):
    return views.graph(_team(team))


# ----------------------------------------------------------------------------- memory explorer
@app.get("/memory/activity")
def memory_activity(team: str | None = None, limit: int = 80):
    return store.ops(team, min(limit, 300))


@app.get("/memory/stats")
def memory_stats(team: str):
    return views.memory_stats(_team(team))


class RecallIn(BaseModel):
    team: str
    query: str = Field(min_length=2)
    tags: list[str] | None = None


@app.post("/memory/recall")
def memory_recall(body: RecallIn):
    before = memory.last_error
    res = memory.recall(_team(body.team), body.query, tags=body.tags or None, limit=10, purpose="memory explorer")
    error = memory.last_error if memory.last_error != before else None
    for m in res:
        m["records"] = [{"id": r, "title": (store.get(r) or {}).get("title", "")} for r in m["refs"] if store.get(r)]
    return {"source": memory.mode, "results": res, "error": error}


class ReflectIn(BaseModel):
    team: str
    query: str = Field(min_length=2)


@app.post("/memory/reflect")
def memory_reflect(body: ReflectIn):
    text = memory.reflect(_team(body.team), body.query, context="memory explorer", budget="mid")
    return {"source": memory.mode, "text": text,
            "available": text is not None,
            "message": None if text is not None else "Reflect needs a Hindsight server; this API is running on the local fallback store."}


# ----------------------------------------------------------------------------- insights 6-11, 13
@app.get("/insights/calibration")
def insights_calibration(team: str):
    return A.calibration(_team(team))


@app.get("/insights/curve")
def insights_curve(team: str):
    return A.calibration_curve(_team(team))


@app.get("/insights/assumptions")
def insights_assumptions(team: str):
    return A.assumption_graveyard(_team(team))


@app.get("/insights/ignored")
def insights_ignored(team: str):
    return A.ignored_warnings(_team(team))


@app.get("/insights/lessons")
def insights_lessons(team: str, reflect: bool = False):
    out = {"lessons": A.lessons(_team(team))}
    if reflect:
        out["reflection"] = memory.reflect(team, "What are the 3 most important lessons this team keeps having to "
                                                 "re-learn? Cite decision and incident IDs.", budget="mid")
    return out


@app.get("/insights/fixes")
def insights_fixes(team: str, service: str | None = None):
    return A.fix_stats(_team(team), service, None)


@app.get("/graph")
def get_graph(team: str):
    return A.graph(_team(team))


@app.get("/teams/compare")
def compare_teams():
    return [A.team_profile(t) for t in config.TEAMS]


# ----------------------------------------------------------------------------- 12. integrations
class PRIn(BaseModel):
    team: str
    title: str
    body: str = ""


@app.post("/integrations/github/pr")
def github_pr(body: PRIn):
    return integrations.pr_comment(_team(body.team), body.title, body.body)


@app.post("/integrations/slack/command")
def slack_command(text: str = Form(...), channel_name: str = Form("payments")):
    team = channel_name if channel_name in config.TEAMS else config.TEAMS[0]
    return integrations.slack_response(team, text)
