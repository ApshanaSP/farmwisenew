/**
 * Jarvis's numbers for the build report: one JSON line per event in data/thunai/telemetry.ndjson (THUNAI_DIR moves it; the
 * folder is git-ignored). Timings, providers and token counts only: never a transcript, never a citizen's words.
 * Server only. A failure here never reaches a turn.
 */
import fs from "fs";
import path from "path";

/** Only these keys are written: a stray `text` field cannot reach the file. */
const FIELDS = new Set(["event", "ms", "provider", "model", "tokens", "lane", "round", "calls", "ok", "why", "turn", "lang", "tier", "bytes", "hop", "cached"]);

export function telemetry(event: string, data: Record<string, string | number | boolean | null | undefined> = {}) {
  try {
    const dir = process.env.THUNAI_DIR || path.join(process.cwd(), "data", "thunai");
    fs.mkdirSync(dir, { recursive: true });
    const row: Record<string, unknown> = { at: new Date().toISOString(), event };
    for (const [k, v] of Object.entries(data)) if (FIELDS.has(k) && v !== undefined) row[k] = v;
    fs.appendFileSync(path.join(dir, "telemetry.ndjson"), `${JSON.stringify(row)}\n`);
  } catch { /* telemetry never reaches a turn */ }
}
