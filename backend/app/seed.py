"""
Seed NEXUS with the synthetic engineering history.

    python -m app.seed            # load into Hindsight + local store
    python -m app.seed --reset    # delete the team banks first (clean, repeatable demo)
"""
import argparse
import json
import logging

from . import config, store
from .memory import decision_tags, decision_text, incident_tags, incident_text, memory, outcome_text

log = logging.getLogger("nexus.seed")


def load():
    decisions = json.loads((config.DATA_DIR / "decisions.json").read_text())
    incidents = json.loads((config.DATA_DIR / "incidents.json").read_text())
    return decisions, incidents


def load_services() -> list[dict]:
    path = config.DATA_DIR / "services.json"
    return json.loads(path.read_text()) if path.exists() else []


def seed(reset: bool = False) -> dict:
    decisions, incidents = load()
    services = [{**s, "id": f"svc:{s['team']}:{s['name']}"} for s in load_services()]
    store.reset([("decision", d) for d in decisions] + [("incident", i) for i in incidents] +
                [("service", s) for s in services])
    counts = {}
    for team in config.TEAMS:
        if reset:
            memory.delete_bank(team)
        memory.ensure_bank(team)
        items = []
        for d in (x for x in decisions if x["team"] == team):
            items.append({"content": decision_text(d), "document_id": f"{d['id']}:proposal",
                          "tags": decision_tags(d, "decision"), "timestamp": d["proposed_at"],
                          "context": "engineering decision proposal"})
            if d.get("status") == "closed":
                items.append({"content": outcome_text(d), "document_id": f"{d['id']}:outcome",
                              "tags": decision_tags(d, "outcome"), "timestamp": d["closed_at"],
                              "context": "engineering decision outcome / retrospective"})
        for i in (x for x in incidents if x["team"] == team):
            items.append({"content": incident_text(i), "document_id": f"{i['id']}:incident",
                          "tags": incident_tags(i), "timestamp": i["date"],
                          "context": "production incident and fix history"})
        memory.retain_batch(team, items)
        counts[team] = len(items)
        log.info("retained %d memories into bank %s", len(items), team)
    return {"memory_mode": memory.mode, "retained": counts, "decisions": len(decisions), "incidents": len(incidents)}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true")
    try:
        print(json.dumps(seed(reset=ap.parse_args().reset), indent=2))
    finally:
        memory.close()
