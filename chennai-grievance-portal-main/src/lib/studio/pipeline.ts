/**
 * One run of the Studio's seven agents over a file: Reader, Profiler (AI), Data Detective, Geo-locator, Designer,
 * Linker, Storyteller (AI). Each step reports as it goes (the page animates the run from these events); a step that
 * needs a model falls back to the rules when none answers, so a file is never refused because the AI is busy.
 */
import { classify } from "@/lib/collector/nlp";
import { askAI, briefAI, checkPlan, noteAI, understandAI } from "@/lib/studio/ai";
import { rulesAsk } from "@/lib/studio/ask";
import { rulesBrief } from "@/lib/studio/brief";
import { clean, type DRow } from "@/lib/studio/clean";
import { designDashboard, panelColumn, periodicWeight } from "@/lib/studio/dashboard";
import { answerText, describeFilter, type Names } from "@/lib/studio/engine";
import { renderPanel } from "@/lib/studio/chartlint";
import { drill } from "@/lib/studio/drill";
import { computeInsights } from "@/lib/studio/insights";
import { LINK_VERSION, crossLink } from "@/lib/studio/link";
import { UserError, parseFileAsync, type Table } from "@/lib/studio/parse";
import { placeRows } from "@/lib/studio/place";
import { profileTable } from "@/lib/studio/profile";
import { refs as loadRefs, type Refs } from "@/lib/studio/refs";
import { mergeSpec, respec, rulesSpec } from "@/lib/studio/spec";
import { dropPending, findBySource, getCandidates, getMeta, getPending, getPick, getRows, getSource, listDatasets, newId, saveCandidates, saveDataset, saveMeta, savePending, savePick, saveSource } from "@/lib/studio/store";
import { type Connected } from "@/lib/studio/connect";
import { choose, safeDecode, schemaHash, tableHash, type Found } from "@/lib/studio/connect/discover";
import { OutcomeStop, duplicateOutcome, findDuplicate, readLink, resolveLink } from "@/lib/studio/connect/resolve";
import { fetchOnce } from "@/lib/studio/fetchurl";
import { readiness } from "@/lib/studio/readiness";
import { createConnector, getConnector, getTable, isDue, listConnectors, readSource, runConnector, type Connector, type Deps, type Every, type Mode as ConnMode } from "@/lib/studio/connectors";
import { cleanAuth, getVault, saveSession, saveVault } from "@/lib/studio/connect/vault";
import { LinkError } from "@/lib/studio/fetchurl";
import { judge, keepChennai, stateWide } from "@/lib/studio/relevance";
import { buildFacts, rulesStory } from "@/lib/studio/story";
import { AUTH_LABEL, ROLE_LABEL, STEPS, type AuthInput, type Outcome, type Brief, type ConnectInfo, type DatasetMeta, type Insight, type RefreshRun, type Relevance, type Filter, type PanelData, type Plan, type Role, type RunEvent, type SourceInfo, type Spec, type StepKey, type StepLog } from "@/lib/studio/types";
import { fmtDay, normKey } from "@/lib/studio/values";
import type { AiBusyError } from "@/lib/ai/gateway";

type Emit = (e: RunEvent) => void;

/**
 * A news feed gets a Topic column: each headline classified with the console's own English / Tamil keyword lists
 * (the same as items from added sources), so the feed can be split by topic and linked with incidents.
 */
function withTopics(t: Table): Table {
  if (t.format !== "feed") return t;
  return {
    ...t, headers: [...t.headers, "Topic"],
    rows: t.rows.map((r) => [...r, classify(`${r[0] ?? ""}. ${r[3] ?? ""}`)?.label ?? "General news"])
  };
}

export function namesOf(r: Refs): Names {
  const byName = new Map<string, number>();
  for (const z of r.zones.values()) byName.set(normKey(z.name), z.zone);
  return {
    zone: (z) => r.zones.get(z)?.name ?? `Zone ${z}`,
    taluk: (t) => r.taluks.get(t)?.name ?? t,
    zoneOf: (v) => {
      const n = String(v).match(/\b(\d{1,2})\b/)?.[1];
      if (n && Number(n) >= 1 && Number(n) <= 15) return Number(n);
      return byName.get(normKey(String(v).replace(/\bzone\b/gi, ""))) ?? null;
    }
  };
}

const why = (e: unknown) => {
  const m = (e as Error)?.message ?? String(e);
  if ((e as AiBusyError)?.retryAfter != null || /busy|rate|429|quota/i.test(m)) return "the AI models are busy right now";
  if (/No AI provider/i.test(m)) return "no AI model is configured";
  return "the AI did not answer in time";
};

export interface IngestInput {
  buf: Buffer;
  file: string;
  kind: SourceInfo["kind"];
  url: string | null;
  contentType?: string;
  /** the page's own address (after redirects), for its relative links */
  base?: string;
  name?: string | null;
  user: string;
  /** a link already read into a table (connect/): used as is */
  table?: Table;
  connect?: ConnectInfo;
  /** the Relevance gate is passed over ("Use anyway") */
  force?: boolean;
  id?: string;
  /** the link engine's verdict on relevance, by rules over the raw rows (connect/gate.ts) */
  pre?: "district" | "partly" | "unrelated" | null;
}

/** Thrown when the Relevance gate stops a run; the stream turns it into a "blocked" event. */
export class BlockedError extends Error {
  constructor(public id: string, public why: string, public signals: string[]) { super(why); }
}

/** The same data was added before: no copy is made; the Collector opens it (or refreshes it) instead. */
function alreadyAdded(meta: DatasetMeta, emit: Emit, url: string | null): never {
  emit({ t: "step", step: "read", state: "done", detail: `Already added on ${fmtDay(meta.createdAt.slice(0, 10))} as "${meta.name}"`, by: "code", ms: 0 });
  throw new OutcomeStop(duplicateOutcome({ id: meta.id, name: meta.name, addedAt: meta.createdAt, link: !!meta.source.url }, url));
}

/** A file whose table has no usable rows ends as NO DATA, never a dashboard. */
function nothingIn(table: Table, file: string): Outcome {
  const r = readiness(table);
  return { kind: "nodata", reason: "empty", url: null, why: r.cols ? `"${file}" has its column names but no rows of data.` : `"${file}" has no rows of data.`,
    checked: [`Read ${file}: ${r.summary}.`], next: [{ label: "Ask the department for the full file", act: "file" }] };
}

const rowsCols = (t: Table) => `${t.rows.length.toLocaleString("en-IN")} rows · ${t.headers.length} columns`;

/** A new dataset from a file, a link or a sample. Returns its id. */
export async function ingest(inp: IngestInput, emit: Emit): Promise<string> {
  if (!inp.id) {
    const same = findBySource(inp.buf);
    if (same) alreadyAdded(same, emit, inp.url);
  }
  const id = inp.id ?? newId();
  const t0 = Date.now();
  emit({ t: "step", step: "read", state: "run", detail: `Opening ${inp.file}` });
  if (!inp.table && /.(png|jpe?g|tiff?|bmp|webp|pdf)$/i.test(inp.file)) emit({ t: "log", text: "A picture or a PDF: tables in pictures are read with OCR (English and Tamil); this takes a few seconds a page." });
  const table = withTopics(inp.table ?? await parseFileAsync(inp.buf, inp.file, inp.contentType, inp.base ?? inp.url ?? undefined));
  const source: SourceInfo = { kind: inp.kind, file: inp.file, url: inp.url, sheet: table.sheet, sheets: table.sheets, bytes: inp.buf.length, caption: table.caption, connect: inp.connect ?? null };
  const readLog: StepLog = { step: "read", ms: Date.now() - t0, by: "code", model: null,
    detail: `${rowsCols(table)}${table.sheet ? ` · sheet "${table.sheet}"` : ""}${inp.connect ? ` · ${inp.connect.method === "browser" ? "read in a browser" : "downloaded"}` : ""}` };
  emit({ t: "step", step: "read", state: "done", detail: readLog.detail, by: "code", ms: readLog.ms });
  if (table.caption) emit({ t: "log", text: `Title above the table kept as context: "${table.caption.slice(0, 120)}"` });
  for (const n of table.notes ?? []) emit({ t: "log", text: n });
  if (table.sheets.length > 1) emit({ t: "log", text: `Workbook has ${table.sheets.length} sheets; read the largest, "${table.sheet}".` });
  if (table.truncated) emit({ t: "log", text: `Only the first ${table.rows.length.toLocaleString("en-IN")} rows were read (${table.truncated.toLocaleString("en-IN")} more in the file).` });
  if (readiness(table).tier === "empty") throw new OutcomeStop(nothingIn(table, inp.file));
  saveSource(id, inp.buf);
  return run({ id, table, source, name: inp.name ?? null, user: inp.user, prior: null, steps: [readLog], sample: inp.kind === "sample", force: inp.force, pre: inp.pre ?? null }, emit);
}

/**
 * What is kept as a link dataset's original: the file as sent when the link held one table, else the chosen table
 * itself, so datasets chosen from one page are not one file to the list (R-06 shows one card per original).
 */
function sourceOf(c: Connected, chosen: Found): Buffer {
  if (c.found.length <= 1 && !c.html) return c.buf;
  return Buffer.from(JSON.stringify({ from: chosen.cand.url ?? c.url, label: chosen.cand.label, headers: chosen.table.headers, rows: chosen.table.rows }));
}

/** The ConnectInfo for a link just read: how, what was found, which one is used, and the refresh plan. */
function connectInfo(c: Connected, chosen: Found, auth: AuthInput, every: number | null, prev?: ConnectInfo | null): ConnectInfo {
  return {
    method: c.method, via: chosen.cand.label, auth: auth.mode, account: auth.mode === "basic" || auth.mode === "login" ? auth.username ?? null : null,
    candidates: c.found.map((f) => f.cand), choice: chosen.cand.id, hash: tableHash(chosen.table), fetchedAt: new Date().toISOString(),
    every, lastOkAt: new Date().toISOString(), lastError: null, history: prev?.history ?? []
  };
}

/**
 * A new dataset from a link (with its sign-in, where the Collector is allowed one): the link engine decides the
 * outcome (connect/resolve.ts); only DATA runs the seven agents. CHOOSE saves the candidates for the picker; NOT
 * RELEVANT keeps the run waiting for "Use anyway"; every other outcome is said as it is.
 */
export async function ingestLink(p: { url: string; auth: AuthInput | null; every: number | null; name: string | null; user: string }, emit: Emit): Promise<string> {
  const auth = cleanAuth(p.auth);
  if ((auth.mode === "login" || auth.mode === "basic") && (!auth.username || !auth.password)) throw new LinkError("Enter both the user name and the password.", "invalid");
  if (auth.mode === "apikey" && !auth.key) throw new LinkError("Enter the API key.", "invalid");
  emit({ t: "step", step: "read", state: "run", detail: auth.mode === "none" ? "Connecting to the link" : `Connecting with ${AUTH_LABEL[auth.mode].toLowerCase()}` });
  const log = (text: string) => emit({ t: "log", text });
  const r = await resolveLink(p.url, auth, { log });
  const o = r.outcome, c = r.connected;
  if (o.kind === "choose" && c && o.pick) {
    const token = newId();
    savePick(token, { pick: { ...o.pick, token }, found: r.found, auth: auth.mode, every: p.every, name: p.name, buf: c.buf.toString("base64"), contentType: c.contentType, pageUrl: c.url, method: c.method });
    if (auth.mode !== "none") saveVault(token, { auth, session: c.session, sessionAt: c.session ? new Date().toISOString() : null });
    emit({ t: "step", step: "read", state: "done", detail: o.why, by: "code", ms: 0 });
    throw new OutcomeStop({ ...o, pick: { ...o.pick, token } });
  }
  if (o.kind === "notrelevant" && c && r.chosen) {
    const id = newId();
    saveSource(id, c.buf);
    saveCandidates(id, r.found);
    if (auth.mode !== "none") saveVault(id, { auth, session: c.session, sessionAt: c.session ? new Date().toISOString() : null });
    const info = connectInfo(c, r.chosen, auth, p.every);
    const t = withTopics(r.chosen.table);
    savePending({ id, table: t, name: p.name, sample: false, spec: null, why: o.why, signals: o.checked, at: new Date().toISOString(),
      source: { kind: "link", file: c.name, url: p.url, sheet: t.sheet, sheets: t.sheets, bytes: c.buf.length, caption: t.caption, connect: info } });
    emit({ t: "step", step: "read", state: "done", detail: "Real data, but not Chennai's", by: "code", ms: 0 });
    throw new OutcomeStop({ ...o, pendingId: id });
  }
  if (o.kind !== "data" || !c || !r.chosen) {
    emit({ t: "step", step: "read", state: "done", detail: o.why.slice(0, 120), by: "code", ms: 0 });
    throw new OutcomeStop(o);
  }
  const chosen = r.chosen;
  for (const line of o.checked) log(line);
  const id = newId();
  saveCandidates(id, r.found);
  if (auth.mode !== "none") saveVault(id, { auth, session: c.session, sessionAt: c.session ? new Date().toISOString() : null });
  const info = connectInfo(c, chosen, auth, p.every);
  info.history = [{ at: info.fetchedAt, ok: true, rows: chosen.table.rows.length, changed: true, note: `Connected · ${chosen.cand.label}` }];
  return ingest({ id, buf: sourceOf(c, chosen), file: c.name, kind: "link", url: p.url, contentType: c.contentType, base: c.url, name: p.name, user: p.user, table: chosen.table, connect: info, pre: o.reason as IngestInput["pre"] }, emit);
}

/** The Collector's choice in the picker: one candidate, several combined, or a series (latest, all, kept updating). */
export interface PickChoice { ids: string[]; mode: "each" | "combine" | "latest" | "all" | "connector"; name?: string | null }

/** Tables with the same columns, one under the other, with the file each row came from. */
export function combineTables(parts: { label: string; table: Table }[], col = "Source file"): Table {
  const first = parts[0].table;
  const key = schemaHash(first.headers);
  if (parts.some((x) => schemaHash(x.table.headers) !== key)) throw new UserError("These datasets have different columns, so they cannot be combined into one. Add them one by one instead.");
  return { ...first, headers: [...first.headers, col], rows: parts.flatMap((x) => x.table.rows.map((r) => [...r, x.label])), part: `${parts.length} combined`,
    caption: first.caption, truncated: 0 };
}

export async function ingestPick(token: string, choice: PickChoice, user: string, emit: Emit): Promise<string> {
  const saved = getPick(token);
  if (!saved) throw new UserError("That list of datasets is no longer here. Add the link again.");
  const picked = choice.ids.map((id) => saved.found.find((f) => f.cand.id === id)).filter((f): f is Found => !!f);
  if (!picked.length) throw new UserError("Choose at least one dataset.");
  // each dataset is its own run (the page adds them one after another)
  if (choice.mode === "each" && picked.length > 1) throw new UserError("Add the datasets one at a time, or combine them into one.");
  const log = (text: string) => emit({ t: "log", text });
  const vault = getVault(token);
  const auth = vault?.auth ?? ({ mode: saved.auth } as AuthInput);
  let chosen: Found = picked[0];
  let every = saved.every;
  emit({ t: "step", step: "read", state: "run", detail: picked.length > 1 ? `Combining ${picked.length} datasets` : `Reading ${chosen.cand.label}` });
  if (choice.mode === "combine" && picked.length > 1) {
    const table = combineTables(picked.map((f) => ({ label: f.cand.label, table: f.table })));
    chosen = { cand: { ...picked[0].cand, id: `combined-${schemaHash(table.headers)}`, label: `${picked.length} datasets combined`, rows: table.rows.length, headers: table.headers.slice(0, 30) }, table };
  } else if (chosen.cand.series && (choice.mode === "all" || choice.mode === "connector")) {
    const s = chosen.cand.series;
    if (choice.mode === "all") {
      log(`Reading all ${s.files.length} files of the series, politely (one a second).`);
      const parts: { label: string; table: Table }[] = [];
      for (const f of s.files.slice(-60)) {
        try {
          const got = await fetchOnce(f.url, null, undefined, 20_000);
          const t = await parseFileAsync(got.buf, got.name, got.contentType, got.url);
          if (schemaHash(t.headers) === schemaHash(chosen.table.headers)) parts.push({ label: f.date, table: t });
          else log(`${f.name} has other columns: left out.`);
        } catch (e) { log(`${f.name} could not be read: ${(e as Error).message.slice(0, 80)}`); }
      }
      if (!parts.length) throw new UserError("None of the series' files could be read.");
      const table = combineTables(parts, "File date");
      chosen = { cand: { ...chosen.cand, id: `series-all-${schemaHash(table.headers)}`, label: `${chosen.cand.label} (all ${parts.length} files)`, rows: table.rows.length, headers: table.headers.slice(0, 30) }, table };
    } else {
      // kept updating: the newest file now, and a daily refresh that finds the next one (Live Connectors)
      every = every ?? 1440;
      log("Kept updating: the newest file now; each day the Studio looks for the next file of the series.");
    }
  }
  const page = { buf: Buffer.from(saved.buf, "base64"), name: `${new URL(saved.pageUrl).hostname}.html`, contentType: saved.contentType, url: saved.pageUrl, method: saved.method,
    found: saved.found, session: vault?.session ?? null, signedIn: "none" } as Connected;
  const dup = findDuplicate(saved.pick.url, null, chosen.table);
  if (dup) alreadyAdded(getMeta(dup.id)!, emit, saved.pick.url);
  const id = newId();
  saveCandidates(id, saved.found.some((f) => f.cand.id === chosen.cand.id) ? saved.found : [chosen, ...saved.found]);
  if (vault) saveVault(id, vault);
  const info = connectInfo(page, chosen, auth, every);
  info.history = [{ at: info.fetchedAt, ok: true, rows: chosen.table.rows.length, changed: true, note: `Chosen in the picker · ${chosen.cand.label}` }];
  const card = saved.pick.cards.find((x) => x.id === picked[0].cand.id);
  const pre = card?.group === "notchennai" ? "unrelated" : card?.chennaiRows ? "district" : "partly";
  const own = sourceOf(page, chosen);
  const made = await ingest({ id, buf: own, file: (chosen.cand.url ? safeDecode(new URL(chosen.cand.url).pathname.split("/").pop() || "") : "") || page.name, kind: "link", url: saved.pick.url, contentType: "application/json", base: page.url, name: choice.name ?? saved.name,
    user, table: chosen.table, connect: info, pre, force: pre === "unrelated" }, emit);
  // "Keep updating daily": a Live Connector reads each new file of the series from now on
  if (choice.mode === "connector") {
    try { const c = await keepUpdated(made); emit({ t: "log", text: `Live Connector on: ${c.schedule.every} at ${c.schedule.at} IST, ${c.mode === "append" ? "new rows added" : "the table replaced"} each time.` }); }
    catch (e) { emit({ t: "log", text: `The Live Connector could not be set up: ${(e as Error).message}` }); }
  }
  return made;
}

/** The table a dataset was read from: its chosen candidate (a link), else its original file read again. */
async function tableOf(meta: DatasetMeta): Promise<Table> {
  const cands = meta.source.connect ? getCandidates(meta.id) : [];
  const c = cands.find((f) => f.cand.id === meta.source.connect?.choice) ?? cands[0];
  if (c) return withTopics(c.table);
  const buf = getSource(meta.id);
  if (!buf) throw new UserError("This dataset's original file is no longer here.");
  return withTopics(await parseFileAsync(buf, meta.source.file, "", meta.source.url ?? undefined));
}
const sameHeaders = (t: Table, meta: DatasetMeta) => t.headers.length === meta.profile.length && t.headers.every((h, i) => h === meta.profile[i]?.header);

/** The same file again with the Collector's corrections to what columns mean. */
export async function remap(id: string, changes: { key: string; role: Role; label?: string }[], user: string, emit: Emit): Promise<string> {
  const meta = getMeta(id);
  if (!meta) throw new UserError("This dataset's original file is no longer here.");
  const table = await tableOf(meta);
  emit({ t: "step", step: "read", state: "done", detail: rowsCols(table), by: "code", ms: 0 });
  const prior = respec(meta.spec, meta.profile, changes);
  return run({ id, table, source: meta.source, name: meta.name, user, prior, steps: [], sample: meta.sample, createdAt: meta.createdAt, rules: meta.rules, force: true }, emit);
}

/** Another of the link's candidates (another table on the page, the file it links): the agents read it afresh. */
export async function chooseCandidate(id: string, candId: string, user: string, emit: Emit): Promise<string> {
  const meta = getMeta(id);
  if (!meta?.source.connect) throw new UserError("Only a dataset added from a link has other tables to choose.");
  const found = getCandidates(id).find((f) => f.cand.id === candId);
  if (!found) throw new UserError("That table is no longer on the saved page. Fetch the link again.");
  const table = withTopics(found.table);
  emit({ t: "step", step: "read", state: "done", detail: `${rowsCols(table)} · ${found.cand.label}`, by: "code", ms: 0 });
  const connect: ConnectInfo = { ...meta.source.connect, choice: candId, via: found.cand.label, hash: tableHash(found.table) };
  return run({ id, table, source: { ...meta.source, caption: table.caption, connect }, name: meta.name, user, prior: sameHeaders(table, meta) ? meta.spec : null, steps: [],
    sample: meta.sample, createdAt: meta.createdAt, rules: meta.rules, force: true }, emit);
}

/** "Use anyway": a run the Relevance gate stopped, resumed past the gate with the reading it already had. */
export async function forceIngest(id: string, user: string, emit: Emit): Promise<string> {
  const p = getPending(id);
  if (!p) throw new UserError("That stopped run is no longer waiting. Add the data again.");
  emit({ t: "step", step: "read", state: "done", detail: rowsCols(p.table), by: "code", ms: 0 });
  dropPending(id);
  return run({ id, table: p.table, source: p.source, name: p.name, user, prior: p.spec, steps: [], sample: p.sample, force: true, pre: p.spec ? null : "unrelated" }, emit);
}

const running = new Set<string>();

/**
 * A link read again (by hand or on its schedule): the same sign-in and session, the same table as before (found by its
 * headers), and nothing rebuilt when its content has not changed. A failed refresh keeps the last good data and says
 * why; a table whose columns changed is read afresh.
 */
export async function refreshDataset(id: string, user: string, emit: Emit): Promise<string> {
  const meta = getMeta(id);
  if (!meta?.source.url) throw new UserError("Only data added by a link can be fetched again.");
  if (running.has(id)) throw new UserError("This link is already being fetched.");
  running.add(id);
  const prev = meta.source.connect ?? null;
  const vault = getVault(id);
  const auth = vault?.auth ?? { mode: prev?.auth ?? "none" } as AuthInput;
  const log = (text: string) => emit({ t: "log", text });
  const record = (run: RefreshRun, patch: Partial<ConnectInfo>) => {
    const m = getMeta(id);
    if (!m) return;
    const base: ConnectInfo = m.source.connect ?? { method: "http", via: "the file at the link", auth: "none", account: null, candidates: [], choice: "", hash: "", fetchedAt: run.at, every: null, lastOkAt: null, lastError: null, history: [] };
    const connect = { ...base, ...patch, history: [run, ...base.history].slice(0, 20) };
    saveMeta({ ...m, source: { ...m.source, connect } });
  };
  try {
    emit({ t: "step", step: "read", state: "run", detail: "Fetching the link again" });
    let c: Connected;
    try {
      c = await readLink(meta.source.url, auth, { session: vault?.session ?? null, log });
    } catch (e) {
      const msg = (e as Error).message;
      record({ at: new Date().toISOString(), ok: false, rows: null, changed: false, note: msg.slice(0, 200) }, { lastError: msg.slice(0, 300) });
      throw e;
    }
    if (c.session && vault) saveSession(id, c.session);
    const chosen = choose(c.found, prev);
    const hash = tableHash(chosen.table);
    const now = new Date().toISOString();
    if (prev && hash === prev.hash && chosen.cand.id === prev.choice) {
      log("Nothing has changed since the last fetch: the dashboard stays as it is.");
      record({ at: now, ok: true, rows: chosen.table.rows.length, changed: false, note: "No change" }, { lastOkAt: now, lastError: null, fetchedAt: now, candidates: c.found.map((f) => f.cand) });
      emit({ t: "step", step: "read", state: "done", detail: `${rowsCols(chosen.table)} · no change`, by: "code", ms: 0 });
      for (const s of STEPS.slice(1)) emit({ t: "step", step: s.key, state: "skip", detail: "No change: kept as it was", by: "code", ms: 0 });
      return id;
    }
    const table = withTopics(chosen.table);
    const same = sameHeaders(table, meta);
    if (prev && !same) log("The table's columns have changed since the last fetch: the agents read it afresh.");
    saveSource(id, sourceOf(c, chosen));
    saveCandidates(id, c.found);
    const connect: ConnectInfo = { ...connectInfo(c, chosen, auth, prev?.every ?? null, prev), history: [{ at: now, ok: true, rows: table.rows.length, changed: true,
      note: `${(table.rows.length - meta.rows) >= 0 ? "+" : ""}${(table.rows.length - meta.rows).toLocaleString("en-IN")} rows${same ? "" : " · columns changed"}` }, ...(prev?.history ?? [])].slice(0, 20) };
    emit({ t: "step", step: "read", state: "done", detail: `${rowsCols(table)} (fetched again)`, by: "code", ms: 0 });
    return await run({ id, table, source: { ...meta.source, bytes: c.buf.length, caption: table.caption, connect }, name: meta.name, user, prior: same ? meta.spec : null, steps: [],
      sample: meta.sample, createdAt: meta.createdAt, rules: meta.rules, force: true }, emit);
  } finally {
    running.delete(id);
  }
}

/** How often a link refreshes by itself (minutes; null: only by hand). */
export function setSchedule(id: string, every: number | null) {
  const meta = getMeta(id);
  if (!meta?.source.connect) throw new UserError("Only data added by a link can refresh on its own.");
  saveMeta({ ...meta, source: { ...meta.source, connect: { ...meta.source.connect, every } } });
}

let lastSweep = 0;
/**
 * Links whose refresh time has come, fetched in the background (one at a time, at most one sweep a minute). Called
 * when the console is open (the Studio list, the overview), like the news sources' sweep.
 */
export function runDueRefreshes() {
  if (Date.now() - lastSweep < 60_000) return;
  lastSweep = Date.now();
  (async () => {
    // a dataset with a Live Connector is kept up to date by it (runDueConnectors), not by the plain refresh
    const live = new Set(listConnectors().map((c) => c.id));
    const due = listDatasets().filter((d) => d.kind === "link" && d.every && !live.has(d.id)).map((d) => getMeta(d.id)).filter((m): m is DatasetMeta => {
      const c = m?.source.connect;
      if (!c?.every) return false;
      const last = Date.parse(c.history[0]?.at ?? c.fetchedAt);
      // after a failure, wait at least 15 minutes before trying again
      return Date.now() - last >= Math.max(c.every, c.lastError ? 15 : 0) * 60_000;
    });
    for (const m of due) {
      await refreshDataset(m.id, "scheduler", (e) => { if (e.t === "log") console.info(`[studio] refresh ${m.id}: ${e.text}`); })
        .catch((e) => console.warn(`[studio] scheduled refresh of ${m.id} failed: ${(e as Error).message.slice(0, 160)}`));
    }
  })().catch((e) => console.warn("[studio] refresh sweep skipped:", (e as Error).message));
}

// ----------------------------------------------------------- Live Connectors --

/** The dataset rebuilt from its connector's table: the seven agents, with the reading it already has when the columns hold. */
async function rebuildFromConnector(c: Connector, table: Table, note: string) {
  const meta = getMeta(c.id);
  if (!meta) throw new Error("The connector's dataset is no longer here.");
  const t = withTopics(table);
  const now = new Date().toISOString();
  const prev = meta.source.connect;
  const connect = prev ? { ...prev, hash: tableHash(t), fetchedAt: now, lastOkAt: now, lastError: null,
    history: [{ at: now, ok: true, rows: t.rows.length, changed: true, note: `Live Connector · ${note}` }, ...prev.history].slice(0, 20) } : null;
  saveSource(c.id, Buffer.from(JSON.stringify({ from: c.url, headers: t.headers, rows: t.rows })));
  await run({ id: c.id, table: t, source: { ...meta.source, caption: t.caption ?? meta.source.caption, connect }, name: meta.name, user: "connector",
    prior: sameHeaders(t, meta) ? meta.spec : null, steps: [], sample: meta.sample, createdAt: meta.createdAt, rules: meta.rules, force: true }, () => {});
}

/** The dataset's watches after a run: the ones crossed, in words. */
async function crossedWatches(c: Connector): Promise<string[]> {
  const meta = getMeta(c.id);
  if (!meta?.rules.length) return [];
  const names = namesOf(await loadRefs());
  const { checkRule } = await import("@/lib/studio/ask");
  return meta.rules.map((r) => checkRule(r, getRows(c.id), meta.spec, names)).filter((x) => !x.ok)
    .map((x) => `Watch: ${x.text} (${x.hits.slice(0, 3).map((h) => `${h.label} ${h.value.toLocaleString("en-IN")}`).join(", ")}${x.total > 3 ? ` and ${x.total - 3} more` : ""})`);
}

/** The real clock, reader and rebuild for connectors. */
export function connectorRuntime(): Deps {
  return {
    now: () => Date.now(),
    read: (c) => readSource(c, getVault(c.id)?.auth ?? { mode: "none" }),
    rebuild: rebuildFromConnector,
    watches: crossedWatches
  };
}

/**
 * A Live Connector for a dataset added from a link: a series keeps reading its newest dated file (appending), any
 * other link its same table (replacing). The pattern is the one the picker found; the Collector can edit it.
 */
export async function keepUpdated(id: string, p: { every?: Every; at?: string; tolerance?: number; mode?: ConnMode; pattern?: string | null; key?: string[]; retention?: number } = {}): Promise<Connector> {
  const meta = getMeta(id);
  if (!meta?.source.url) throw new UserError("Only data added from a link can be kept up to date.");
  if (getConnector(id)) throw new UserError("This dataset is already kept up to date.");
  const cands = getCandidates(id);
  const chosen = cands.find((f) => f.cand.id === meta.source.connect?.choice) ?? cands[0];
  const series = chosen?.cand.series ?? null;
  const table = getConnectorSeed(id, chosen?.table ?? null);
  if (!table) throw new UserError("The dataset's table is no longer here: fetch the link again first.");
  const pattern = p.pattern ?? series?.pattern?.replace(/\?.*$/, "") ?? null;
  const c = createConnector({ id, name: meta.name, url: series ? (chosen?.cand.source ?? meta.source.url) : meta.source.url,
    locate: series && pattern ? "newest-file-matching" : "same-table", pattern, table, every: p.every, at: p.at, tolerance: p.tolerance,
    mode: p.mode, key: p.key, retention: p.retention, seen: series ? [series.to] : [] });
  // the plain refresh hands over to the connector
  if (meta.source.connect) saveMeta({ ...meta, source: { ...meta.source, connect: { ...meta.source.connect, every: null } } });
  return c;
}
function getConnectorSeed(id: string, t: Table | null): Table | null { return t ?? getTable(id); }

/** Connectors whose time has come, one at a time (so one site is never read twice at once), at most a sweep a minute. */
let lastLive = 0;
export function runDueConnectors() {
  if (Date.now() - lastLive < 60_000) return;
  lastLive = Date.now();
  (async () => {
    const deps = connectorRuntime();
    for (const c of listConnectors().filter((x) => isDue(x, Date.now()))) {
      await runConnector(c.id, deps).then((r) => console.info(`[studio] connector ${c.id}: ${r.kind} · ${r.note.slice(0, 120)}`))
        .catch((e) => console.warn(`[studio] connector ${c.id} failed: ${(e as Error).message.slice(0, 160)}`));
    }
  })().catch((e) => console.warn("[studio] connector sweep skipped:", (e as Error).message));
}

interface RunCtx {
  id: string; table: Table; source: SourceInfo; name: string | null; user: string; prior: Spec | null; steps: StepLog[]; sample: boolean;
  createdAt?: string; rules?: DatasetMeta["rules"]; force?: boolean;
  /** the link engine's rules verdict on relevance (connect/gate.ts) */
  pre?: "district" | "partly" | "unrelated" | null;
}

async function run(ctx: RunCtx, emit: Emit): Promise<string> {
  let { table } = ctx;
  const refs = await loadRefs();
  const names = namesOf(refs);
  const steps = ctx.steps;
  const step = async <T>(key: StepKey, doing: string, fn: () => Promise<{ v: T; detail: string; by: StepLog["by"]; model?: string | null }>) => {
    const t = Date.now();
    emit({ t: "step", step: key, state: "run", detail: doing });
    const r = await fn();
    const log: StepLog = { step: key, ms: Date.now() - t, detail: r.detail, by: r.by, model: r.model ?? null };
    steps.push(log);
    emit({ t: "step", step: key, state: "done", detail: r.detail, by: r.by, model: r.model ?? null, ms: log.ms });
    return r.v;
  };

  // ---- Profiler
  let profile = profileTable(table);
  // a news feed mixes every subject: no single department owns it
  const owner = (sp: Spec): Spec => (table.format === "feed" ? Object.assign(sp, { department: null, deptName: null }) : sp);
  const spec = await step("understand", ctx.prior ? "Using your reading of the columns" : "Reading the headers and sample rows", async () => {
    if (ctx.prior) {
      const s = owner({ ...ctx.prior, columns: ctx.prior.columns.map((c, i) => ({ ...c, type: profile[i]?.type ?? c.type })) });
      return { v: s, detail: mapping(s), by: s.by === "ai" ? "ai" : "rules", model: s.model };
    }
    const rules = rulesSpec(profile, ctx.source.file, ctx.source.caption, refs);
    try {
      const { spec: ai, info } = await understandAI({ file: ctx.source.file, caption: ctx.source.caption, sheet: ctx.source.sheet, rows: table.rows.length, profile,
        sample: table.rows.slice(0, 10), refs, user: ctx.user });
      const s = owner(mergeSpec(ai, profile, rules, refs, `${info.provider}/${info.model}`));
      return { v: s, detail: mapping(s), by: "ai", model: s.model };
    } catch (e) {
      console.warn("[studio] profiler fell back to rules:", (e as Error).message?.slice(0, 160));
      emit({ t: "log", text: `Read by rules instead of AI: ${why(e)}.` });
      return { v: owner(rules), detail: mapping(owner(rules)), by: "rules" };
    }
  });
  for (const c of spec.columns.filter((x) => x.role !== "ignore").slice(0, 12)) emit({ t: "log", text: `${c.header} → ${ROLE_LABEL[c.role]}${c.unit ? ` (${c.unit})` : ""}` });
  // a Tamil Nadu table (one row per district): Chennai's rows only
  const fullTable = table;
  let filtered: Relevance["filtered"] = null;
  const sw = stateWide(table, spec);
  if (sw) {
    const kept = keepChennai(table, sw.index);
    if (kept.rows.length) {
      filtered = { column: sw.label, kept: kept.rows.length, of: table.rows.length };
      emit({ t: "log", text: `A Tamil Nadu table by ${sw.label.toLowerCase()}: keeping Chennai's ${kept.rows.length.toLocaleString("en-IN")} of ${table.rows.length.toLocaleString("en-IN")} rows.` });
      table = kept;
      profile = profileTable(table);
    }
  }

  // ---- Data Detective
  const cleaned = await step("clean", "Looking for duplicates, typos, bad dates and outliers", async () => {
    const c = clean(table, spec);
    const fixes = c.detective.issues.filter((i) => i.action !== "info");
    const detail = fixes.length ? fixes.slice(0, 3).map((i) => short(i.label, i.count)).join(" · ") : "No problems found";
    return { v: c, detail, by: "code" };
  });
  for (const i of cleaned.detective.issues.filter((x) => x.action !== "info").slice(0, 8))
    emit({ t: "log", text: `${i.action === "fixed" ? "Fixed" : i.action === "removed" ? "Removed" : "Flagged"}: ${i.label} (${i.count})${i.examples[0] ? ` — e.g. ${i.examples[0]}` : ""}` });
  const rows = cleaned.rows;

  // ---- Geo-locator
  await step("place", "Matching places to wards, zones and taluks", async () => {
    const r = await placeRows(rows, spec, refs, cleaned.detective, cleaned.minDate);
    const has = spec.columns.some((c) => ["place", "ward", "zone", "taluk", "lat"].includes(c.role));
    const detail = !has
      ? (r.placed ? `${r.placed.toLocaleString("en-IN")} of ${rows.length.toLocaleString("en-IN")} name a Chennai place in their text · ${r.zones} zones` : "No place column, and no Chennai place named in the text")
      : `${r.placed.toLocaleString("en-IN")} of ${rows.length.toLocaleString("en-IN")} rows on the map · ${r.zones} zones${r.wards ? ` · ${r.wards} wards` : ""}`;
    return { v: r, detail, by: "code" };
  });
  if (cleaned.detective.unplaced.length) emit({ t: "log", text: `Not in the Chennai gazetteer: ${cleaned.detective.unplaced.slice(0, 4).map((u) => u.v).join(", ")}` });
  // a periodic return (the same number of rows on every report date): count its cases, not its rows
  spec.weight = periodicWeight(rows, spec);
  // a period table (district x year): totals are read for the latest period
  spec.panelBy = panelColumn(rows, spec);
  if (spec.panelBy && !spec.weight && spec.primary && !spec.openValues.length) spec.weight = spec.primary;
  if (spec.panelBy) emit({ t: "log", text: `One row per ${spec.columns.find((c) => c.key === spec.panelBy)?.label.toLowerCase()} per period: totals are read for the latest period, not added across periods.` });
  else if (spec.weight) emit({ t: "log", text: `A periodic return: one row per place per report date, so "${spec.columns.find((c) => c.key === spec.weight)?.label}" is counted, not the rows.` });

  // ---- the Relevance gate: is this the district's data?
  const gate = judge({ spec, rows, table, source: ctx.source, filtered, forced: !!ctx.force, pre: ctx.pre ?? null });
  emit({ t: "log", text: `Relevance: ${gate.relevance.verdict === "district" ? "Chennai district data" : gate.relevance.verdict === "partly" ? "wider data that concerns Chennai" : "does not read as Chennai district data"} · ${gate.relevance.why}` });
  if (gate.block) {
    savePending({ id: ctx.id, table: fullTable, source: ctx.source, name: ctx.name, sample: ctx.sample, spec, why: gate.relevance.why, signals: gate.relevance.signals, at: new Date().toISOString() });
    throw new BlockedError(ctx.id, gate.relevance.why, gate.relevance.signals);
  }

  // ---- Designer
  const prev = ctx.prior && getMeta(ctx.id);
  const panels = await step("design", "Choosing the right chart for each question", async () => {
    const p = designDashboard(rows, spec, cleaned.window);
    // panels the Collector added by asking stay on the dashboard
    const extra = (prev?.panels ?? []).filter((x) => x.id.startsWith("q_"));
    const kpis = p.filter((x) => x.chart === "kpi").length;
    return { v: [...p, ...extra], detail: `${kpis} headline cards · ${p.length - kpis} charts${p.some((x) => x.chart === "map") ? " · a map" : ""}`, by: "code" };
  });

  // ---- Linker
  const link = await step("link", "Comparing with 6 months of district incidents", async () => {
    try {
      const l = await crossLink(rows, spec, cleaned.window, refs);
      if (!l) return { v: null, detail: rows.some((r) => r._z != null || r._d != null) ? "No clear link with district incidents" : "No places or dates to compare with incidents", by: "code" };
      const what = l.mode === "place"
        ? (l.strength === "none" ? `No clear link with ${l.incLabel.toLowerCase()}` : `${cap(l.strength)} link with ${l.incLabel.toLowerCase()} · ρ ${l.rho.toFixed(2)} over ${l.n} zones`)
        : `Moves with ${l.time?.label.toLowerCase()} week by week · ρ ${l.time?.rho.toFixed(2)}`;
      return { v: l, detail: what, by: "code" };
    } catch (e) {
      console.warn("[studio] link failed", e);
      return { v: null, detail: "Could not read the incidents store", by: "code" };
    }
  });
  if (link?.overlap.length) emit({ t: "log", text: `Shared hotspots: ${link.overlap.map((o) => o.name).join(", ")}` });
  if (link?.sample.length) emit({ t: "log", text: `${link.sample.length} matching incidents ready to open (${link.sample.filter((s) => s.open).length} still open)` });

  // ---- Insight Analyst: every angle computed, then the AI picks what matters and writes the brief
  const story = rulesStory(buildFacts(rows, spec, cleaned.detective, link, cleaned.window, names), spec, link);
  const brief = await step("story", "Mining backlogs, delays, gaps, hotspots and trends", async () => {
    const ins = computeInsights(rows, spec, cleaned.detective, link, cleaned.window, names, getMeta(ctx.id)?.brief ?? null);
    emit({ t: "log", text: `${ins.length} insights computed: ${[...new Set(ins.map((x) => x.label))].slice(0, 6).join(", ")}` });
    const b = await writeBrief(ins, spec, rows.length, cleaned.window, ctx.user, (m) => emit({ t: "log", text: m }));
    const detail = `${b.items.length} insights chosen from ${ins.length}${b.by === "ai" ? ` · every number checked${b.dropped ? ` · ${b.dropped} dropped` : ""}` : " · by rules"}`;
    return { v: b, detail, by: b.by, model: b.model };
  });
  emit({ t: "log", text: `Verdict: ${brief.verdict}` });

  const now = new Date().toISOString();
  const meta: DatasetMeta = {
    id: ctx.id, name: ctx.name || spec.title, source: ctx.source, createdAt: ctx.createdAt ?? now, updatedAt: now,
    rows: rows.length, cols: table.headers.length, window: cleaned.window, spec, profile, detective: cleaned.detective, panels, link, linkVersion: LINK_VERSION, story, brief,
    relevance: gate.relevance, rules: ctx.rules ?? [], steps, sample: ctx.sample
  };
  saveDataset(meta, rows);
  dropPending(ctx.id);
  return ctx.id;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function mapping(s: Spec): string {
  const pick = (r: Role) => s.columns.find((c) => c.role === r);
  const parts = (["date", "place", "ward", "zone", "status", "category"] as Role[]).map((r) => pick(r)).filter(Boolean).map((c) => `${ROLE_LABEL[c!.role].split(" /")[0]}: ${c!.header}`);
  const prim = s.columns.find((c) => c.key === s.primary);
  if (prim) parts.push(`Measure: ${prim.header}`);
  return `One row = one ${s.entity}${s.deptName ? ` · ${s.deptName}` : ""} · ${parts.slice(0, 4).join(" · ")}`;
}

function short(label: string, n: number): string {
  const l = label.replace(/\(.*?\)/g, "").split(":").pop()!.trim().toLowerCase();
  return `${n.toLocaleString("en-IN")} ${l.length > 46 ? l.slice(0, 44) + "…" : l}`;
}

/** The brief over computed insights: the AI's when a model answers and its numbers check, else the rules'. */
async function writeBrief(ins: Insight[], spec: Spec, rows: number, window: DatasetMeta["window"], user: string, log: (m: string) => void): Promise<Brief> {
  const rules = rulesBrief(ins, spec);
  if (ins.length < 2) return rules;
  try {
    const b = await briefAI({ spec, insights: ins, rules, rows, window, user });
    if (b.by !== "ai") log("The AI's numbers did not check out: the brief is written by rules.");
    return b;
  } catch (e) {
    log(`Brief written by rules: ${why(e)}.`);
    return rules;
  }
}

/** The insights and brief computed again over the stored rows (a dataset added before the brief existed, or "re-analyse"). */
export async function analyse(id: string, user: string): Promise<Brief> {
  const meta = getMeta(id);
  if (!meta) throw new UserError("Unknown dataset.");
  const rows = getRows(id);
  const names = namesOf(await loadRefs());
  const ins = computeInsights(rows, meta.spec, meta.detective, meta.link, meta.window, names, meta.brief ?? null);
  const brief = await writeBrief(ins, meta.spec, rows.length, meta.window, user, (m) => console.info(`[studio] ${m}`));
  // the leaner dashboard, for a dataset designed before it (panels the Collector added are kept)
  const panels = [...designDashboard(rows, meta.spec, meta.window), ...meta.panels.filter((p) => p.id.startsWith("q_"))];
  saveMeta({ ...meta, brief, panels });
  return brief;
}

// --------------------------------------------------------------------- reading --

export interface DatasetView {
  meta: Omit<DatasetMeta, "profile"> & { profile: DatasetMeta["profile"] };
  panels: PanelData[];
  /** the dashboard's own filters (chosen by clicking: a zone, a type, a week), each in words */
  focus: { filters: Filter[]; chips: string[] };
  brief: Brief;
  /** the brief is the rules' quick one: the page asks for the AI's (analyse) */
  briefStale: boolean;
}

/**
 * The dataset with every dashboard panel computed under the dashboard's filters. The map keeps every zone (so another
 * zone can be picked) but follows the other filters.
 */
export async function view(id: string, extra: Filter[]): Promise<DatasetView | null> {
  let meta = getMeta(id);
  if (!meta) return null;
  const rows = getRows(id);
  const refs = await loadRefs();
  const names = namesOf(refs);
  if ((meta.linkVersion ?? 1) < LINK_VERSION) meta = await relink(meta, rows, refs, names);
  const panels = meta.panels.map((p) => renderPanel(rows, meta.spec, { ...p, filters: [...p.filters, ...(p.chart === "map" ? extra.filter((f) => f.col !== "_z") : extra)] }, names, meta.window));
  const brief = meta.brief ?? rulesBrief(computeInsights(rows, meta.spec, meta.detective, meta.link, meta.window, names), meta.spec);
  return { meta, panels, focus: { filters: extra, chips: extra.map((f) => describeFilter(meta.spec, f, names)) }, brief, briefStale: !meta.brief };
}

/**
 * A dataset linked by an older crossLink is linked again once. When the link changes, the story and the AI brief written
 * from it are rebuilt (the brief when next asked for), so no card keeps the old figures.
 */
async function relink(meta: DatasetMeta, rows: DRow[], refs: Refs, names: Names): Promise<DatasetMeta> {
  let link = meta.link;
  try {
    link = await crossLink(rows, meta.spec, meta.window, refs);
  } catch (e) {
    console.warn("[studio] relink failed", (e as Error).message);
    return meta;
  }
  const changed = JSON.stringify(link) !== JSON.stringify(meta.link);
  const next: DatasetMeta = { ...meta, link, linkVersion: LINK_VERSION,
    ...(changed ? { story: rulesStory(buildFacts(rows, meta.spec, meta.detective, link, meta.window, names), meta.spec, link), brief: null } : {}) };
  saveMeta(next);
  return next;
}

/** One mark of a chart opened (see drill.ts). */
export async function drillInto(id: string, plan: Plan, key: string | number | null, extra: Filter[]) {
  const meta = getMeta(id);
  if (!meta) throw new UserError("Unknown dataset.");
  return drill(meta, getRows(id), plan, key, extra, namesOf(await loadRefs()));
}

/** A draft note to the department about a drilled finding. */
export async function draftNote(id: string, plan: Plan, key: string | number | null, extra: Filter[], user: string) {
  const meta = getMeta(id);
  if (!meta) throw new UserError("Unknown dataset.");
  const d = await drill(meta, getRows(id), plan, key, extra, namesOf(await loadRefs()));
  return noteAI({ spec: meta.spec, label: d.label === plan.title ? plan.title : `${d.label} (${plan.title.toLowerCase()})`, facts: d.facts, user });
}

/** A question to one dataset: the AI's plan (or the rules'), run by the engine. */
export async function ask(id: string, question: string, user: string) {
  const meta = getMeta(id);
  if (!meta) throw new UserError("Unknown dataset.");
  const rows = getRows(id);
  const refs = await loadRefs();
  const names = namesOf(refs);
  const zones = [...refs.zones.values()].map((z) => z.name);
  let out, by: "ai" | "rules" = "ai", model: string | null = null;
  try {
    const r = await askAI({ question, spec: meta.spec, profile: meta.profile, zones, user });
    out = r.out;
    model = `${r.info.provider}/${r.info.model}`;
  } catch (e) {
    console.warn("[studio] analyst fell back to rules:", (e as Error).message?.slice(0, 120));
    out = rulesAsk(question, meta.spec, meta.profile, zones);
    by = "rules";
  }
  if (out.kind === "unsupported") return { kind: "unsupported" as const, note: out.note || "These columns cannot answer that.", by, model };
  const plan: Plan = checkPlan(out, meta.spec, `q_${Date.now().toString(36)}`);
  const panel = renderPanel(rows, meta.spec, plan, names, meta.window);
  return {
    kind: out.kind, plan, panel, answer: answerText(panel, meta.spec), note: out.note && !/\d/.test(out.note) ? out.note.slice(0, 200) : null, by, model,
    watch: out.kind === "watch" && out.watch_op && out.watch_threshold != null ? { op: out.watch_op, threshold: out.watch_threshold } : null,
    window: meta.window.from ? `${fmtDay(meta.window.from)} – ${fmtDay(meta.window.to)}` : null
  };
}
