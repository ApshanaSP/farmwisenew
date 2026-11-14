/**
 * Section 6's telemetry fields: kept, append-only, one JSON line each; and never a citizen's words, whatever key they come under.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { telemetry } from "./telemetry";

let dir = "";
const rows = () => fs.readFileSync(path.join(dir, "telemetry.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "jv-tel-")); vi.stubEnv("THUNAI_DIR", dir); });
afterEach(() => vi.unstubAllEnvs());

describe("telemetry (v4 section 6)", () => {
  it("keeps the new fields: STT, TTS, cache, 429 fallbacks, hedges, barge-in, self-heard, gate tiers, signals", () => {
    telemetry("stt_decode", { model: "whisper-large-v3", decode: "ta", ms: 610, conf: -0.21, ok: true, lane: "engaged" });
    telemetry("stt", { sttWinner: "ta", ms: 640, calls: 2 });
    telemetry("tts", { provider: "gemini", model: "gemini-3.8-flash-tts", ms: 280, chars: 92 });
    telemetry("llm", { provider: "anthropic", model: "claude-opus-5-5", cacheRead: 1800, cacheWrite: 0, path: "format", hedged: false });
    telemetry("fallback_429", { provider: "groq", model: "qwen/qwen3.8-27b", status: 429, fallback: "groq/openai/gpt-oss-20b" });
    telemetry("hedge", { provider: "anthropic", model: "claude-opus-5-5", into: "groq/qwen/qwen3.8-27b", after: 6000, why: "default", winner: "main" });
    telemetry("llm", { model: "claude-opus-5-5", ms: 6100, aborted: true, ok: false });
    telemetry("barge_in", { barge: "browser-pause", ms: 140 });
    telemetry("self_heard", { selfHeard: true, count: 1 });
    telemetry("gate", { tier: 2, act: true, lane: "named" });
    telemetry("signal", { signal: "overdue", spoken: false, severity: "high" });
    const r = rows();
    expect(r.length).toBe(11);
    expect(r[0]).toMatchObject({ event: "stt_decode", model: "whisper-large-v3", decode: "ta", ms: 610, conf: -0.21 });
    expect(r[1]).toMatchObject({ sttWinner: "ta" });
    expect(r[2]).toMatchObject({ provider: "gemini", ms: 280, chars: 92 });
    expect(r[3]).toMatchObject({ cacheRead: 1800, cacheWrite: 0, path: "format", hedged: false });
    expect(r[4]).toMatchObject({ status: 429, fallback: "groq/openai/gpt-oss-20b" });
    expect(r[5]).toMatchObject({ into: "groq/qwen/qwen3.8-27b", after: 6000, winner: "main" });
    expect(r[6]).toMatchObject({ aborted: true, ms: 6100 });
    expect(r[7]).toMatchObject({ barge: "browser-pause", ms: 140 });
    expect(r[8]).toMatchObject({ selfHeard: true, count: 1 });
    expect(r[9]).toMatchObject({ tier: 2, act: true });
    expect(r[10]).toMatchObject({ signal: "overdue", spoken: false, severity: "high" });
  });

  it("appends: a second write never replaces the first", () => {
    telemetry("turn", { lane: "planner", ms: 1 });
    telemetry("turn", { lane: "planner", ms: 2 });
    expect(rows().map((x) => x.ms)).toEqual([1, 2]);
  });

  it("never writes text: an unknown key is dropped, and a known key holding a sentence, a Tamil word or a phone is dropped", () => {
    telemetry("llm", { text: "drain overflowing near my house", heard: "x", why: "the citizen said the drain is blocked", model: "சாக்கடை", turn: "98400 12345", lane: "planner" } as never);
    const r = rows()[0];
    expect(r).toEqual({ at: r.at, event: "llm", lane: "planner" });
    expect(JSON.stringify(r)).not.toMatch(/drain|சாக்கடை|98400/);
  });
});
