"""Feature 12 — Pre-commit Nudge: premortem comments on design-doc PRs and a Slack slash command."""
from __future__ import annotations

from .agents import premortem


def pr_comment(team: str, title: str, body: str) -> dict:
    rep = premortem.run(team, f"{title}\n\n{body}")
    high = [w for w in rep["warnings"] if w["severity"] == "high"]
    lines = [f"### 🧭 NEXUS premortem — {len(rep['warnings'])} warning(s) from {rep['memory_stats']['used']} memories",
             f"**Verdict:** `{rep['verdict']}`", ""]
    if rep.get("corrected_estimate"):
        c = rep["corrected_estimate"]
        lines.append(f"**Estimate:** {c['raw_estimate_weeks']}w → realistic **{c['corrected_weeks']}w** "
                     f"(range {c['range_weeks'][0]}–{c['range_weeks'][1]}w, team factor {c['factor']}x)\n")
    for w in rep["warnings"][:6]:
        ev = ", ".join(w.get("evidence", [])[:4])
        lines.append(f"- **[{w['severity']}] {w['title']}** — {w['detail']}" + (f" _(evidence: {ev})_" if ev else ""))
    if rep.get("checklist"):
        lines += ["", "**Before merging:**"] + [f"- [ ] {c}" for c in rep["checklist"]]
    return {"comment_markdown": "\n".join(lines), "high_severity": len(high), "report": rep}


def slack_response(team: str, text: str) -> dict:
    rep = premortem.run(team, text)
    blocks = [{"type": "section", "text": {"type": "mrkdwn",
               "text": f"*NEXUS premortem* · verdict `{rep['verdict']}` · {len(rep['warnings'])} warnings"}}]
    for w in rep["warnings"][:5]:
        blocks.append({"type": "section", "text": {"type": "mrkdwn",
                       "text": f"*{w['title']}*\n{w['detail']}\n_evidence: {', '.join(w.get('evidence', [])[:4])}_"}})
    return {"response_type": "in_channel", "blocks": blocks}
