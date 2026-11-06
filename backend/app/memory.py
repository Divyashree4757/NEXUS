"""
Hindsight memory layer for NEXUS.

One memory bank per team (`nexus-payments`, `nexus-platform`) so each team's
blind spots stay separate (feature: Team vs Team).

What we retain
  * decision proposals  -> document_id "D-0112:proposal", tags kind:decision
  * decision outcomes   -> document_id "D-0112:outcome",  tags kind:outcome, assumption:broken, risk:ignored
  * incidents + fixes   -> document_id "INC-0204:incident", tags kind:incident, fix:temporary ...
  * engineer feedback   -> document_id "INC-0910:feedback"

Every recalled memory carries its document_id, which we resolve back to the
structured record so the UI can show exactly which past events produced a warning
(feature: Evidence Panel).

If HINDSIGHT_URL is not configured, a small local keyword store is used so the app
still boots for UI work. The /health endpoint and UI badge make that obvious;
the real demo must run against Hindsight.
"""
from __future__ import annotations

import asyncio
import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from . import config, store

log = logging.getLogger("nexus.memory")

BANK_MISSION = (
    "You are the engineering memory of the {team} team. Remember engineering decisions, "
    "their assumptions, estimates vs actual effort, risks people raised (and whether they were "
    "ignored), production incidents, which fixes failed or only worked temporarily, and which "
    "fix finally resolved them. Prefer concrete numbers, names, services and dates."
)
REFLECT_MISSION = (
    "When asked, act as a skeptical staff engineer running a premortem. Ground every claim in "
    "remembered decisions and incidents, cite their IDs (D-xxxx, INC-xxxx), and call out repeated "
    "patterns: estimate overruns, assumptions that keep breaking, ignored warnings, temporary fixes."
)

ID_RE = re.compile(r"\b(D-\d{4}|INC-\d{4})\b")


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def bank_id(team: str) -> str:
    return f"{config.BANK_PREFIX}-{team}"


def _to_dt(s: str | None):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


# ----------------------------------------------------------------------------- text renderers
def decision_text(d: dict) -> str:
    a = "; ".join(f"({i + 1}) {x['text']}" for i, x in enumerate(d.get("assumptions", []))) or "none stated"
    r = "; ".join(f"{x['raised_by']} warned: \"{x['text']}\"" for x in d.get("risks", [])) or "no risks raised"
    return (
        f"Engineering decision {d['id']} by the {d['team']} team, proposed {d.get('proposed_at', '')}: "
        f"\"{d['title']}\". Category: {d['category']}. Owner: {d.get('owner', 'unknown')}. "
        f"Services: {', '.join(d.get('services', []))}. Estimated effort: {d.get('estimate_weeks')} weeks. "
        f"Assumptions: {a}. Risks raised: {r}."
    )


def outcome_text(d: dict) -> str:
    est, act = d.get("estimate_weeks") or 0, d.get("actual_weeks") or 0
    ratio = f"{act / est:.1f}x" if est else "n/a"
    parts = [
        f"Outcome of decision {d['id']} (\"{d['title']}\", {d['category']}, {d['team']} team), closed "
        f"{d.get('closed_at', '')}: took {act} weeks against an estimate of {est} weeks ({ratio} the estimate)."
    ]
    for x in d.get("assumptions", []):
        if x.get("held"):
            parts.append(f"Assumption \"{x['text']}\" held.")
        else:
            parts.append(f"Assumption \"{x['text']}\" BROKE: {x.get('note', '')}.")
    for x in d.get("risks", []):
        status = "was addressed" if x.get("addressed") else "was IGNORED"
        mat = " and it MATERIALIZED" if x.get("materialized") else ""
        parts.append(f"Risk raised by {x['raised_by']} (\"{x['text']}\") {status}{mat}.")
    if d.get("linked_incidents"):
        parts.append(f"This decision led to incidents {', '.join(d['linked_incidents'])}.")
    if d.get("outcome_summary"):
        parts.append(d["outcome_summary"])
    return " ".join(parts)


def incident_text(i: dict) -> str:
    fixes = []
    for f in i.get("attempted_fixes", []):
        if f["result"] == "temporary":
            fixes.append(f"\"{f['action']}\" only worked TEMPORARILY (problem returned after {f.get('lasted_days', '?')} days)")
        elif f["result"] == "failed":
            fixes.append(f"\"{f['action']}\" FAILED")
        else:
            fixes.append(f"\"{f['action']}\" RESOLVED it")
    link = f" It was traced back to decision {i['linked_decision']}." if i.get("linked_decision") else ""
    return (
        f"Production incident {i['id']} on {i['service']} ({i['team']} team), {i.get('date', '')}: \"{i['title']}\". "
        f"Error signature: {i.get('error_signature', '')}. Symptoms: {', '.join(i.get('symptoms', []))}. "
        f"Fixes tried: {'; '.join(fixes) or 'none recorded'}. Root cause: {i.get('root_cause') or 'unknown'}. "
        f"Resolution: {i.get('resolution') or 'unresolved'}. Time to resolve: {i.get('ttr_minutes', '?')} minutes.{link}"
    )


def decision_tags(d: dict, phase: str) -> list[str]:
    tags = [f"kind:{phase}", f"category:{d['category']}", f"team:{d['team']}"]
    tags += [f"service:{s}" for s in d.get("services", [])]
    if phase == "outcome":
        if any(not a.get("held") for a in d.get("assumptions", [])):
            tags.append("assumption:broken")
        if any(not r.get("addressed") for r in d.get("risks", [])):
            tags.append("risk:ignored")
    return tags


def incident_tags(i: dict) -> list[str]:
    tags = ["kind:incident", f"service:{i['service']}", f"team:{i['team']}"]
    results = {f["result"] for f in i.get("attempted_fixes", [])}
    tags += [f"fix:{r}" for r in results]
    return tags


# ----------------------------------------------------------------------------- local fallback
class _LocalStore:
    """Keyword-overlap fallback. Only used when no Hindsight server is configured."""

    def __init__(self):
        self.items: dict[str, list[dict]] = {}

    def retain(self, bank, content, document_id=None, tags=None, timestamp=None, context=None, **_):
        self.items.setdefault(bank, [])
        self.items[bank] = [x for x in self.items[bank] if x["document_id"] != document_id]
        self.items[bank].append({"text": content, "document_id": document_id, "tags": tags or [],
                                 "type": "experience", "context": context,
                                 "occurred_start": timestamp.isoformat() if timestamp else None})

    def recall(self, bank, query, tags=None, limit=8):
        q = set(re.findall(r"[a-z0-9]{3,}", query.lower()))
        scored = []
        for x in self.items.get(bank, []):
            if tags and not set(tags) & set(x["tags"]):
                continue
            words = set(re.findall(r"[a-z0-9]{3,}", x["text"].lower()))
            s = len(q & words) / (len(q) or 1)
            if s > 0:
                scored.append((s, x))
        scored.sort(key=lambda t: -t[0])
        return [dict(x, score=round(s, 3)) for s, x in scored[:limit]]

    def delete(self, bank):
        self.items.pop(bank, None)


# ----------------------------------------------------------------------------- facade
class Memory:
    """
    All Hindsight calls run on ONE dedicated asyncio loop in a background thread, using the client's async
    methods. The sync wrappers in hindsight_client call loop.run_until_complete() on whatever loop the calling
    thread has, which breaks inside FastAPI (a running loop at startup, a different loop per worker thread,
    and an aiohttp session bound to the first loop it saw). One loop avoids all of that and lets parallel
    recalls genuinely run concurrently.

    Failures never crash a request: recall returns [] and reflect returns None, retain is reported back to the
    caller, and every failure is written to the memory-operation log with its error so the UI can show it.
    """

    def __init__(self):
        self.mode = "hindsight" if config.HINDSIGHT_URL else "local-fallback"
        self._local = _LocalStore()
        self._client = None
        self._loop = None
        self.last_error: str | None = None
        if self.mode == "hindsight":
            from hindsight_client import Hindsight
            self._loop = asyncio.new_event_loop()
            threading.Thread(target=self._loop.run_forever, name="hindsight-loop", daemon=True).start()
            self._client = Hindsight(base_url=config.HINDSIGHT_URL, api_key=config.HINDSIGHT_API_KEY, timeout=120)
        self._pool = ThreadPoolExecutor(max_workers=6)

    def _run(self, coro, timeout: float = 180):
        return asyncio.run_coroutine_threadsafe(coro, self._loop).result(timeout=timeout)

    def _fail(self, team: str, op: str, err: Exception, body: dict):
        self.last_error = f"{op}: {err}"
        log.warning("hindsight %s failed: %s", op, err)
        store.log_op(_now(), team, op, self.mode, {**body, "error": str(err)[:300]})

    def close(self):
        if self._client:
            try:
                self._run(self._client.aclose(), timeout=10)
            except Exception:
                pass

    # ---- banks
    def ensure_bank(self, team: str):
        if not self._client:
            return
        try:
            self._run(self._client.acreate_bank(
                bank_id=bank_id(team), name=f"NEXUS · {team}",
                mission=BANK_MISSION.format(team=team), reflect_mission=REFLECT_MISSION,
                disposition={"skepticism": 4, "literalism": 3, "empathy": 2},
            ))
        except Exception as e:  # already exists, or server ignores some fields
            log.info("create_bank(%s): %s", team, e)

    def delete_bank(self, team: str):
        if self._client:
            try:
                self._run(self._client.adelete_bank(bank_id=bank_id(team)))
            except Exception as e:
                log.info("delete_bank(%s): %s", team, e)
        self._local.delete(bank_id(team))

    # ---- retain
    def retain(self, team: str, content: str, document_id: str, tags: list[str], timestamp: str | None = None,
               context: str = "engineering history", metadata: dict | None = None) -> bool:
        """Returns False (and logs the error) if Hindsight rejected the write. The record itself is kept either way."""
        ts = _to_dt(timestamp)
        t0 = time.perf_counter()
        body = {"document_id": document_id, "tags": tags, "context": context, "content": content[:600],
                "refs": self._refs({"text": content, "document_id": document_id})}
        try:
            if self._client:
                self._run(self._client.aretain(bank_id=bank_id(team), content=content, document_id=document_id, tags=tags,
                                               timestamp=ts, context=context, metadata=metadata or {}))
            else:
                self._local.retain(bank_id(team), content, document_id=document_id, tags=tags, timestamp=ts, context=context)
        except Exception as e:
            self._fail(team, "retain", e, body)
            return False
        store.log_op(_now(), team, "retain", self.mode, {**body, "latency_ms": round((time.perf_counter() - t0) * 1000)})
        return True

    def retain_batch(self, team: str, items: list[dict]):
        """items: {content, document_id, tags, timestamp, context}. Raises on failure (used by seeding)."""
        body = {"count": len(items), "context": "seed: synthetic engineering history",
                "document_ids": [i["document_id"] for i in items][:80]}
        t0 = time.perf_counter()
        if self._client:
            payload = []
            for it in items:
                p = {"content": it["content"], "document_id": it["document_id"], "tags": it["tags"],
                     "context": it.get("context", "engineering history")}
                if it.get("timestamp"):
                    p["timestamp"] = it["timestamp"] + "T12:00:00Z" if len(it["timestamp"]) == 10 else it["timestamp"]
                payload.append(p)
            try:
                for k in range(0, len(payload), 8):
                    self._run(self._client.aretain_batch(bank_id=bank_id(team), items=payload[k:k + 8]), timeout=600)
            except Exception as e:
                self._fail(team, "retain_batch", e, body)
                raise
        else:
            for it in items:
                self._local.retain(bank_id(team), it["content"], document_id=it["document_id"], tags=it["tags"],
                                   timestamp=_to_dt(it.get("timestamp")), context=it.get("context", ""))
        store.log_op(_now(), team, "retain_batch", self.mode, {**body, "latency_ms": round((time.perf_counter() - t0) * 1000)})

    def retain_decision(self, d: dict) -> bool:
        return self.retain(d["team"], decision_text(d), f"{d['id']}:proposal", decision_tags(d, "decision"),
                           d.get("proposed_at"), "engineering decision proposal")

    def retain_outcome(self, d: dict) -> bool:
        return self.retain(d["team"], outcome_text(d), f"{d['id']}:outcome", decision_tags(d, "outcome"),
                           d.get("closed_at"), "engineering decision outcome / retrospective")

    def retain_progress(self, d: dict, note: str, at: str) -> bool:
        """Implementation progress / unexpected problems recorded while a decision is in flight (learning loop step 4)."""
        n = len(d.get("progress", []))
        return self.retain(d["team"], f"Progress update on decision {d['id']} (\"{d['title']}\") on {at}: {note}",
                           f"{d['id']}:progress:{n}", ["kind:progress", f"category:{d['category']}", f"team:{d['team']}"]
                           + [f"service:{s}" for s in d.get("services", [])], at, "implementation progress")

    def retain_incident(self, i: dict) -> bool:
        return self.retain(i["team"], incident_text(i), f"{i['id']}:incident", incident_tags(i),
                           i.get("date"), "production incident and fix history")

    # ---- recall
    def recall(self, team: str, query: str, tags: list[str] | None = None, limit: int = 8,
               budget: str = "mid", purpose: str = "") -> list[dict]:
        t0 = time.perf_counter()
        body = {"query": query, "tags": tags, "purpose": purpose}
        try:
            if self._client:
                try:
                    resp = self._run(self._client.arecall(bank_id=bank_id(team), query=query, tags=tags, budget=budget,
                                                          max_tokens=2048, tags_match="any"))
                except Exception as e:
                    if not tags:
                        raise
                    log.warning("recall with tags failed (%s); retrying without tags", e)
                    resp = self._run(self._client.arecall(bank_id=bank_id(team), query=query, budget="low", max_tokens=2048))
                out = [{"id": r.id, "text": r.text, "type": r.type, "document_id": r.document_id, "tags": r.tags or [],
                        "occurred_start": str(r.occurred_start) if r.occurred_start else None}
                       for r in (resp.results or [])[:limit]]
            else:
                out = self._local.recall(bank_id(team), query, tags=tags, limit=limit)
        except Exception as e:
            self._fail(team, "recall", e, {**body, "results": 0})
            return []
        for m in out:
            m["refs"] = self._refs(m)
            m["query"] = query
            m["source"] = self.mode
        store.log_op(_now(), team, "recall", self.mode, {
            **body, "results": len(out), "refs": sorted({r for m in out for r in m["refs"]})[:20],
            "latency_ms": round((time.perf_counter() - t0) * 1000)})
        return out

    def recall_many(self, team: str, queries: list[tuple[str, list[str] | None]], limit: int = 6,
                    purpose: str = "") -> list[dict]:
        """Run several recall strategies in parallel and de-duplicate."""
        futures = [self._pool.submit(self.recall, team, q, t, limit, "mid", purpose) for q, t in queries]
        seen, merged = set(), []
        for f in futures:
            try:
                for m in f.result():
                    key = m.get("id") or m["text"]
                    if key not in seen:
                        seen.add(key)
                        merged.append(m)
            except Exception as e:
                log.warning("recall strategy failed: %s", e)
        return merged

    @staticmethod
    def _refs(m: dict) -> list[str]:
        refs = set(ID_RE.findall(m.get("text") or ""))
        if m.get("document_id"):
            refs.add(m["document_id"].split(":")[0])
        return sorted(refs)

    # ---- reflect
    def reflect(self, team: str, query: str, context: str | None = None, budget: str = "low") -> str | None:
        if not self._client:
            return None
        t0 = time.perf_counter()
        try:
            text = self._run(self._client.areflect(bank_id=bank_id(team), query=query, context=context, budget=budget)).text
        except Exception as e:
            self._fail(team, "reflect", e, {"query": query, "context": context})
            return None
        store.log_op(_now(), team, "reflect", self.mode, {
            "query": query, "context": context, "text": (text or "")[:1500], "refs": sorted(set(ID_RE.findall(text or "")))[:20],
            "latency_ms": round((time.perf_counter() - t0) * 1000)})
        return text


memory = Memory()
