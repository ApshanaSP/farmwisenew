/**
 * The shipped race on the Tamil held-out clips: the same hearUtterance the console uses, both forced decodes and the choice, with
 * the site language set the hard way (English), so it also shows how often Tamil speech is told apart. 2 requests a clip, paced for
 * 20 a minute. Clips come from eval/holdout/tamil-asr/prepare.py.
 *   ASR_DIR=<clips> npx vitest run --config vitest.live.config.ts src/lib/thunai/stt.live.ts
 */
import fs from "fs";
import path from "path";
import { expect, it } from "vitest";
import { hearUtterance } from "./stt";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (t: string) => t.normalize("NFC").replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
function edit(a: string[], b: string[]): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}

it.runIf(!!process.env.ASR_DIR)("the shipped race on the Tamil clips", async () => {
  const man = JSON.parse(fs.readFileSync(path.join(process.cwd(), "eval", "holdout", "tamil-asr", "manifest.json"), "utf8")) as { items: { id: string; file: string; kind: string; sha256: string; text: string }[] };
  const items = [...man.items].sort((a, b) => a.sha256.localeCompare(b.sha256));
  const rows: { id: string; kind: string; ms: number; lang?: string; model?: string | null; cer?: number; wer?: number; capacity?: boolean; empty?: boolean }[] = [];
  for (const it2 of items) {
    const b = fs.readFileSync(path.join(process.env.ASR_DIR!, it2.file));
    const t0 = Date.now();
    try {
      const h = await hearUtterance(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, { lane: "engaged", site: "en" });
      if (h.budget === "low") rows.push({ id: it2.id, kind: it2.kind, ms: Date.now() - t0, capacity: true });
      else if (!h.text) rows.push({ id: it2.id, kind: it2.kind, ms: Date.now() - t0, empty: true });
      else {
        const r = norm(it2.text), y = norm(h.text);
        rows.push({ id: it2.id, kind: it2.kind, ms: Date.now() - t0, lang: h.lang, model: h.model, cer: edit([...r], [...y]) / Math.max(1, [...r].length), wer: edit(r.split(" "), y.split(" ")) / Math.max(1, r.split(" ").length) });
      }
    } catch { rows.push({ id: it2.id, kind: it2.kind, ms: Date.now() - t0, capacity: true }); }
    await sleep(6200);
  }
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);
  const scored = rows.filter((x) => x.cer != null);
  const part = (k: string) => { const s = scored.filter((x) => x.kind === k); return { n: s.length, cer: mean(s.map((x) => x.cer!)), wer: mean(s.map((x) => x.wer!)) }; };
  const ms = rows.map((x) => x.ms).sort((a, b) => a - b);
  const summary = { n: rows.length, scored: scored.length, capacity: rows.filter((x) => x.capacity).length, empty: rows.filter((x) => x.empty).length, cer: mean(scored.map((x) => x.cer!)), wer: mean(scored.map((x) => x.wer!)), clean: part("clean"), noisy: part("noisy"), heardAsTamil: scored.filter((x) => x.lang === "ta").length, ms_p50: ms[Math.floor(ms.length / 2)] };
  fs.writeFileSync(path.join(process.cwd(), "eval", "holdout", "results", "asr-final-race.json"), JSON.stringify({ at: new Date().toISOString(), site: "en", summary, rows }, null, 0));
  console.log(JSON.stringify(summary));
  expect(rows.length).toBe(items.length);
}, 1_500_000);
