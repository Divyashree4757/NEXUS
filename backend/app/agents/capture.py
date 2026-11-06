"""Feature 1 — Decision Capture: turn a pasted design doc / ADR / epic into a structured decision."""
from __future__ import annotations

import re

from .. import llm

CATEGORIES = ["migration", "infra", "feature", "frontend", "data", "security", "developer-experience"]

SYSTEM = f"""You extract engineering decisions from design docs, ADRs and Jira epics.
Return JSON with keys:
  title (short imperative), category (one of {CATEGORIES}), estimate_weeks (number or null),
  owner (string or null), services (list of service names, kebab-case),
  assumptions (list of strings: every belief the plan depends on, explicit or implicit),
  risks (list of {{"raised_by": name or "author", "text": risk}}),
  summary (one sentence).
Never invent numbers that are not in the text."""


def _fallback(text: str) -> dict:
    lines = [l.strip(" -*•\t") for l in text.splitlines() if l.strip()]
    title = lines[0][:120] if lines else "Untitled decision"
    est = re.search(r"(\d+(?:\.\d+)?)\s*(?:weeks?|wks?)", text, re.I)
    low = text.lower()
    cat = next((c for c, kws in {
        "migration": ["migrat", "move from", "replace", "kafka", "postgres"],
        "security": ["soc 2", "pci", "vault", "sso", "compliance", "security"],
        "frontend": ["ui", "page", "frontend", "react", "checkout page"],
        "infra": ["kubernetes", "k8s", "redis", "infra", "cluster", "pgbouncer"],
        "data": ["cdc", "warehouse", "pipeline", "feature store"],
    }.items() if any(k in low for k in kws)), "feature")
    assumptions, in_block = [], False
    for l in lines:
        if re.match(r"(?i)^assumptions?\s*:?\s*$", l):
            in_block = True
            continue
        if in_block and re.match(r"(?i)^(risks?|owner|services?|estimate|scope|plan)\b", l):
            in_block = False
        if in_block or re.match(r"(?i)(we assume|assum\w*:|no schema|should be|will be|won't|wont)", l):
            assumptions.append(re.sub(r"(?i)^(we assume( that)?|assum\w*:)\s*", "", l))
    risks = [{"raised_by": "author", "text": l} for l in lines if re.match(r"(?i)(risk|concern|warning)", l) and not l.rstrip().endswith(":")]
    services = sorted(set(re.findall(r"\b[a-z]+-(?:service|gateway|worker|api|scorer|web|cluster|runners|vault)\b", low)))
    return {"title": title, "category": cat, "estimate_weeks": float(est.group(1)) if est else None,
            "owner": None, "services": services, "assumptions": assumptions, "risks": risks,
            "summary": title, "extracted_by": "heuristic"}


def extract(text: str) -> dict:
    out = llm.complete_json(SYSTEM, text[:8000])
    if not isinstance(out, dict) or not out.get("title"):
        return _fallback(text)
    base = _fallback(text)
    out.setdefault("assumptions", base["assumptions"])
    out.setdefault("risks", [])
    out.setdefault("services", base["services"])
    if out.get("category") not in CATEGORIES:
        out["category"] = base["category"]
    if out.get("estimate_weeks") in ("", None):
        out["estimate_weeks"] = base["estimate_weeks"]
    out["risks"] = [r if isinstance(r, dict) else {"raised_by": "author", "text": str(r)} for r in out["risks"]]
    out["assumptions"] = [a if isinstance(a, str) else a.get("text", str(a)) for a in out["assumptions"]]
    out["extracted_by"] = "llm"
    return out
