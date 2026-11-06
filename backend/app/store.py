"""
Structured record store (SQLite).

Hindsight holds the *semantic* memory the agents reason over. This store holds the
same records in structured form so we can compute numbers deterministically
(calibration factors, fix-decay, charts) and resolve recalled memories back to
the decision / incident they came from via Hindsight's `document_id`.
"""
import json
import sqlite3
import threading
from typing import Iterable

from .config import DB_PATH

_lock = threading.Lock()


def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.execute("""CREATE TABLE IF NOT EXISTS records(
        id TEXT PRIMARY KEY, kind TEXT, team TEXT, date TEXT, body TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS events(
        seq INTEGER PRIMARY KEY AUTOINCREMENT, team TEXT, kind TEXT, ref TEXT, at TEXT, body TEXT)""")
    c.execute("""CREATE TABLE IF NOT EXISTS memory_ops(
        seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, team TEXT, op TEXT, source TEXT, body TEXT)""")
    return c


def log_op(at: str, team: str, op: str, source: str, body: dict):
    """Audit log of every real memory operation (retain / recall / reflect) and where it ran."""
    with _lock, _conn() as c:
        c.execute("INSERT INTO memory_ops(at, team, op, source, body) VALUES(?,?,?,?,?)",
                  (at, team, op, source, json.dumps(body)))


def ops(team: str | None = None, limit: int = 100) -> list[dict]:
    q, args = "SELECT seq, at, team, op, source, body FROM memory_ops", []
    if team:
        q += " WHERE team=?"
        args.append(team)
    with _lock, _conn() as c:
        rows = c.execute(q + " ORDER BY seq DESC LIMIT ?", args + [limit]).fetchall()
    return [{"seq": n, "at": a, "team": t, "op": o, "source": src, **json.loads(b)} for n, a, t, o, src, b in rows]


def op_counts(team: str | None = None) -> dict:
    q, args = "SELECT op, COUNT(*) FROM memory_ops", []
    if team:
        q += " WHERE team=?"
        args.append(team)
    with _lock, _conn() as c:
        return dict(c.execute(q + " GROUP BY op", args).fetchall())


def upsert(kind: str, rec: dict):
    date = rec.get("closed_at") or rec.get("proposed_at") or rec.get("date") or ""
    with _lock, _conn() as c:
        c.execute("REPLACE INTO records(id, kind, team, date, body) VALUES(?,?,?,?,?)",
                  (rec["id"], kind, rec["team"], date, json.dumps(rec)))


def get(rec_id: str) -> dict | None:
    with _lock, _conn() as c:
        row = c.execute("SELECT body FROM records WHERE id=?", (rec_id,)).fetchone()
    return json.loads(row[0]) if row else None


def list_records(kind: str, team: str | None = None) -> list[dict]:
    q, args = "SELECT body FROM records WHERE kind=?", [kind]
    if team:
        q += " AND team=?"
        args.append(team)
    with _lock, _conn() as c:
        rows = c.execute(q + " ORDER BY date", args).fetchall()
    return [json.loads(r[0]) for r in rows]


def next_id(prefix: str, start: int = 900) -> str:
    """New records (created live in the app) are numbered from `start` upwards."""
    with _lock, _conn() as c:
        rows = c.execute("SELECT id FROM records WHERE id LIKE ?", (prefix + "-%",)).fetchall()
    nums = [int(r[0].split("-")[1]) for r in rows if r[0].split("-")[1].isdigit()]
    return f"{prefix}-{max([n for n in nums if n >= start] + [start - 1]) + 1:04d}"


def log_event(team: str, kind: str, ref: str, at: str, body: dict):
    """Append-only activity log (premortems run, outcomes logged ...) used for the learning-curve view."""
    with _lock, _conn() as c:
        c.execute("INSERT INTO events(team, kind, ref, at, body) VALUES(?,?,?,?,?)",
                  (team, kind, ref, at, json.dumps(body)))


def events(team: str | None = None) -> list[dict]:
    q, args = "SELECT team, kind, ref, at, body FROM events", []
    if team:
        q += " WHERE team=?"
        args.append(team)
    with _lock, _conn() as c:
        rows = c.execute(q + " ORDER BY seq", args).fetchall()
    return [{"team": t, "kind": k, "ref": r, "at": a, **json.loads(b)} for t, k, r, a, b in rows]


def reset(records: Iterable[tuple[str, dict]] = ()):
    with _lock, _conn() as c:
        c.execute("DELETE FROM records")
        c.execute("DELETE FROM events")
        c.execute("DELETE FROM memory_ops")
    for kind, rec in records:
        upsert(kind, rec)
