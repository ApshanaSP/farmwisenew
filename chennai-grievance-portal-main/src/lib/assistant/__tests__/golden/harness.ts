/**
 * The chatbot's golden questions run on frozen district data (eval/store, scripts/freeze-eval-store.cjs): the same build
 * steps and SQL translation as the live AWS store, the clock pinned to the moment the data was frozen, no language model
 * (the rules and templates answer, as they must when Groq and Gemini are both out) and no meaning search. Deterministic and free.
 */
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import type { DatabaseSync } from "node:sqlite";
import { expand, translate } from "@/lib/aws/dialect";

export const STORE = path.join(process.cwd(), "eval", "store");
// The Data Studio questions run on the committed samples in a folder of their own, never on this PC's own datasets
process.env.STUDIO_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), "golden-studio-"));
export const haveStore = () => fs.existsSync(path.join(STORE, "manifest.json"));

/** The shared pool the mocked database modules forward to, set once the frozen build is loaded. */
export const holder: { pool: any; db: DatabaseSync | null } = { pool: null, db: null };

export const forward = {
  query: (...a: unknown[]) => holder.pool.query(...a),
  execute: (...a: unknown[]) => holder.pool.query(...a),
  getConnection: () => holder.pool.getConnection(),
  end: async () => undefined
};

export interface Frozen { db: DatabaseSync; frozenAt: Date }

/** Loads the frozen build into memory with a private copy of its durable store (the questions' chats are written there). */
export async function loadFrozen(): Promise<Frozen> {
  const { buildDb, applyBuildHooks, poolOver } = await import("@/lib/aws/store");
  const m = JSON.parse(fs.readFileSync(path.join(STORE, "manifest.json"), "utf8"));
  const durable = path.join(os.tmpdir(), `golden-durable-${process.pid}-${Date.now()}.sqlite`);
  fs.copyFileSync(path.join(STORE, "durable.sqlite"), durable);
  const db = await buildDb(m, async (name: string, t: { sha: string }) =>
    JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(STORE, "tables", `${name}-${t.sha}.json.gz`))).toString("utf8")), durable);
  holder.db = db;
  holder.pool = poolOver(db);
  // the build steps the live server applies (readable headlines, news sanity, clusters ...)
  await import("@/lib/collector/derive");
  await applyBuildHooks(db);
  await loadStudioSamples(["fever", "beds"]);
  return { db, frozenAt: new Date(m.frozen_at) };
}

/** The Studio samples the questions ask about, read by the Studio's own pipeline (rules only: no model in the golden run). */
async function loadStudioSamples(keys: string[]) {
  const { sampleFile } = await import("@/lib/studio/samples");
  const { ingest } = await import("@/lib/studio/pipeline");
  const { listDatasets } = await import("@/lib/studio/store");
  if (listDatasets().length) return;
  for (const k of keys) {
    const s = sampleFile(k);
    if (s) await ingest({ buf: s.buf, file: s.info.file, kind: "sample", url: null, name: s.info.title, user: "golden@test", force: true }, () => undefined);
  }
}

/** One value from the frozen store (for expected numbers). */
export function one(sql: string, params: unknown[] = []): number {
  const [s, p] = expand(translate(sql), params);
  const row = holder.db!.prepare(s).get(...(p as never[])) as Record<string, unknown> | undefined;
  return Number(row ? Object.values(row)[0] : NaN);
}
