"""
Groq LLM wrapper that never takes the app down.

The recommended Groq models occasionally return malformed JSON / tool-call errors,
so every call goes through:
  1. primary model with JSON mode
  2. same model without JSON mode (some errors are JSON-mode specific)
  3. fallback model
  4. JSON repair (strip <think> blocks, code fences, trailing commas)
If all fail (or no key is configured) callers get `None` and use their
deterministic, memory-derived fallback instead.
"""
from __future__ import annotations

import json
import logging
import re
import time

from . import config

log = logging.getLogger("nexus.llm")

_client = None
if config.GROQ_API_KEY:
    from groq import Groq
    _client = Groq(api_key=config.GROQ_API_KEY, max_retries=2, timeout=60)

mode = "groq" if _client else "offline"


def _repair(text: str):
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.S)
    if m:
        text = m.group(1)
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0], default=-1)
    if start < 0:
        raise ValueError("no JSON found")
    text = text[start:]
    end = max(text.rfind("}"), text.rfind("]"))
    text = re.sub(r",\s*([}\]])", r"\1", text[: end + 1])
    return json.loads(text)


def complete_json(system: str, user: str, temperature: float = 0.2, max_tokens: int = 2500):
    """Return parsed JSON (dict/list) or None."""
    if not _client:
        return None
    attempts = [
        (config.GROQ_MODEL, True),
        (config.GROQ_MODEL, False),
        (config.GROQ_FALLBACK_MODEL, False),
    ]
    for i, (model, json_mode) in enumerate(attempts):
        try:
            kwargs = dict(model=model, temperature=temperature, max_tokens=max_tokens,
                          messages=[{"role": "system", "content": system + "\nRespond with a single JSON object only."},
                                    {"role": "user", "content": user}])
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            resp = _client.chat.completions.create(**kwargs)
            return _repair(resp.choices[0].message.content or "")
        except Exception as e:  # rate limits, json_validate_failed, tool-call errors, timeouts
            log.warning("LLM attempt %d (%s, json=%s) failed: %s", i + 1, model, json_mode, e)
            time.sleep(0.6 * (i + 1))
    return None
