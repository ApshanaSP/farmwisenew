"""Optional LLM helper for the agents. Off unless config llm.enabled is true AND a key exists.

It uses the same Groq / Gemini setup as the news work (dintel/newsllm.py: GROQ_API_KEY and GEMINI_API_KEY in
district_intel/.env, each provider the other's backup). `llm.jobs` in config.yaml says which agent steps may use it;
today only "link": a second opinion on report pairs the linker is not sure about (a person still decides).
Every output is checked and falls back to the deterministic result when the check fails. Personal data never reaches
the model: the pipeline does not carry names, phone numbers or addresses in the first place.
"""
from __future__ import annotations

import json
import time
from typing import Any

from ..util import log


class LLM:
    def __init__(self, cfg: dict[str, Any], news_cfg: dict[str, Any] | None = None) -> None:
        from ..newsllm import LLM as Chain

        self.cfg = cfg
        self.calls = 0
        self.jobs = set(cfg.get("jobs") or [])
        self._chain = Chain(news_cfg or {}, "link") if cfg.get("enabled") else None
        self.enabled = bool(self._chain and self._chain.enabled)
        self.deadline = time.time() + 60 * float(cfg.get("minutes", 3))
        if cfg.get("enabled") and not self.enabled:
            log.info("agent LLM: no GROQ_API_KEY or GEMINI_API_KEY in district_intel/.env; agents use their rules")

    def for_job(self, job: str) -> "LLM | None":
        """This helper for an agent step listed in llm.jobs, else None (the step keeps its rules)."""
        return self if self.enabled and job in self.jobs else None

    def available(self) -> bool:
        return (self.enabled and not self._chain.stopped and time.time() < self.deadline
                and self.calls < int(self.cfg.get("max_calls_per_run", 200)))

    def json(self, system: str, user: str, schema: dict, max_tokens: int = 1500) -> dict | None:
        """One strict-schema call; None when it failed or the run's budget is spent."""
        if not self.available():
            return None
        self.calls += 1
        return self._chain.json(system, user, schema, self.deadline, max_tokens=max_tokens)

    @property
    def model(self) -> str:
        return self._chain.model if self._chain else "none"

    # the old free-form interface (briefing rewrite, data-quality notes): JSON object or text, no schema
    def complete(self, system: str, user: str, json_mode: bool = False, max_tokens: int = 900) -> str | None:
        schema = {"type": "object", "additionalProperties": False, "required": ["text"], "properties": {"text": {"type": "string"}}}
        out = self.json(system + "\nReply as JSON {\"text\": ...}.", user, schema, max_tokens)
        return out["text"] if out else None

    def complete_json(self, system: str, user: str) -> dict | None:
        out = self.complete(system, user, json_mode=True)
        if not out:
            return None
        try:
            return json.loads(out)
        except json.JSONDecodeError:
            return None
