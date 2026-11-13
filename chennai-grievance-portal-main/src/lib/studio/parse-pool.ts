/**
 * The Data Studio reads every file and fetched page in a separate process, never on the web server's thread (QA pass 7). SheetJS's own
 * inflate loops for ever on a workbook whose deflate stream never ends (redteam-gate-05, reviewer5-04), patterns backtrack on crafted
 * feeds and pages (reviewer5-09, 10), and a workbook or PDF can unpack to gigabytes. No check before a parser can rule all of that out, so
 * the parser runs where it can be stopped:
 *
 *   time      each job has STUDIO_PARSE_SECONDS (60 s; a 15 MB workbook, the upload cap, reads in about 13 s); past it the process is killed
 *   memory    V8's heap capped at STUDIO_PARSE_HEAP_MB (1 GB) by a flag, the whole process at STUDIO_PARSE_RSS_MB (1.5 GB) by its own
 *             watchdog thread (parse-worker-main.ts); a process that passes either ends, the server never does
 *   many      at most STUDIO_PARSE_PROCS processes (2) read at once; up to STUDIO_PARSE_QUEUE jobs (24) wait, each at most two minutes
 *   result    one file sends back at most MAX_CELLS cells (parse-worker.ts), so the answer itself cannot fill the server
 *
 * The Collector is told which limit stopped a file (ParseLimitError, a ParseError, so every caller shows its message). A process is
 * started on first use, kept two minutes after its last job, and never keeps the server (or a test run) alive on its own.
 *
 * The process runs scripts/studio-parse-worker.mjs from the project folder (as embed.ts runs scripts/embed-worker.mjs), so `next dev`,
 * `next start` and vitest all run the same bundled reader. Node's child_process is loaded at run time (not bundled), as embed.ts loads
 * worker_threads.
 */
import path from "path";
import type { ChildProcess } from "node:child_process";
import { ParseError, UserError, type Table } from "@/lib/studio/parse";
import { MEMORY_MARK, fromWire, type FileJob, type Job, type Page, type Reply, type WireReply } from "@/lib/studio/parse-worker";
import type { PageFacts } from "@/lib/studio/connect/links";

/** A file stopped by one of the reader's limits, with what the Collector can do about it. */
export class ParseLimitError extends ParseError {
  constructor(public reason: "time" | "memory" | "busy" | "stopped", message: string) { super(message); }
}

const num = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
/** The limits, read on each job (tests lower them). */
export function parseLimits() {
  return { seconds: num("STUDIO_PARSE_SECONDS", 60), heapMb: num("STUDIO_PARSE_HEAP_MB", 1024), rssMb: num("STUDIO_PARSE_RSS_MB", 1536),
    procs: num("STUDIO_PARSE_PROCS", 2), queue: num("STUDIO_PARSE_QUEUE", 24), waitSeconds: num("STUDIO_PARSE_WAIT_SECONDS", 120) };
}

const IDLE_MS = 2 * 60_000;
const START_MS = 30_000;
export const READER = () => path.join(process.cwd(), "scripts", "studio-parse-worker.mjs");

const MSG = {
  time: (s: number) => `This file took longer than ${s} seconds to read, so the Studio stopped reading it and nothing from it was added. It may be damaged or built in a way that makes readers run on. Save the table again as .xlsx or .csv and add it again, or ask the department for a fresh copy.`,
  memory: () => "This file needs more memory to read than the Studio allows (it unpacks to far more than its size), so the Studio stopped reading it and nothing from it was added. Save the table again as .csv or .xlsx, or split it into smaller files.",
  busy: () => "The Studio is reading many files at the moment. Try this one again in a minute.",
  stopped: () => "The Studio's file reader stopped while reading this file, so nothing from it was added. Save the table again as .xlsx or .csv and add it again, or ask the department for a fresh copy.",
  start: () => "The Studio's file reader could not start, so the file was not read. Try again in a minute; if it keeps failing, the server's logs say why."
};

interface Pending { id: number; job: Job; ok: (r: Reply) => void; no: (e: Error) => void; wait: ReturnType<typeof setTimeout> | null }
interface Proc { child: ChildProcess; ready: boolean; job: Pending | null; timer: ReturnType<typeof setTimeout> | null; idle: ReturnType<typeof setTimeout> | null; err: string; gone: boolean }
interface Pool { procs: Proc[]; queue: Pending[]; seq: number; /** what stopped jobs, for the logs and the tests */ stopped: { time: number; memory: number; stopped: number; busy: number } }

declare global {
  // eslint-disable-next-line no-var
  var __studioParse: Pool | undefined;
}
const P: Pool = (globalThis.__studioParse ??= { procs: [], queue: [], seq: 0, stopped: { time: 0, memory: 0, stopped: 0, busy: 0 } });

/** The reader processes now (their pids, whether busy) and what has stopped jobs: for the tests and the logs. */
export function readerState() {
  return { procs: P.procs.map((p) => ({ pid: p.child.pid ?? null, ready: p.ready, busy: !!p.job })), queued: P.queue.length, stopped: { ...P.stopped } };
}

/** Every reader process ended (a job still being read is told the reader stopped): for the tests, which change the limits between files. */
export function stopReaders() {
  for (const proc of [...P.procs]) end(proc, "stopped");
}

/** The server's own environment, less what a reader of untrusted files does not need (keys, passwords) or must not inherit (a debugger port, a heap size). */
function readerEnv(rssMb: number): Record<string, string | undefined> {
  const keep = new Set(["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "TZ", "LANG", "NODE_ENV"]);
  const env: Record<string, string | undefined> = {};
  // the names as the system spells them (Windows: "Path"), each once
  for (const k of Object.keys(process.env)) if (keep.has(k.toUpperCase())) env[k] = process.env[k];
  // NODE_OPTIONS is kept (a test's frozen clock), less a debugger and a heap size: the reader's own flag sets its heap
  const opts = (process.env.NODE_OPTIONS ?? "").split(/\s+/).filter((o) => o && !/^--(inspect|debug|max[-_]old[-_]space[-_]size)/.test(o)).join(" ");
  if (opts) env.NODE_OPTIONS = opts;
  env.STUDIO_PARSE_RSS_MB = String(rssMb);
  return env;
}

function spawn(): Proc | null {
  const L = parseLimits();
  let child: ChildProcess;
  try {
    const { fork } = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule("node:child_process") as typeof import("node:child_process");
    child = fork(READER(), [], { execArgv: [`--max-old-space-size=${L.heapMb}`], env: readerEnv(L.rssMb) as NodeJS.ProcessEnv, serialization: "advanced", stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true });
  } catch (e) {
    console.error("[studio] the file reader could not start", e);
    return null;
  }
  const proc: Proc = { child, ready: false, job: null, timer: null, idle: null, err: "", gone: false };
  P.procs.push(proc);
  child.stderr?.on("data", (d: Buffer) => { proc.err = (proc.err + d.toString("utf8")).slice(-4000); });
  // a process that never says it is ready (a missing bundle, a broken install) fails what waits on it, not for ever
  const start = setTimeout(() => { if (!proc.ready) end(proc, "start"); }, START_MS);
  start.unref();
  child.on("message", (m: { ready?: boolean; id?: number; reply?: WireReply }) => {
    // ready: a job, or the idle clock (a process started for a job another one took still leaves: QA pass 7 reviewer)
    if (m?.ready) { clearTimeout(start); proc.ready = true; pump(); if (!proc.job) rest(proc); return; }
    const p = proc.job;
    if (!p || m?.id !== p.id || !m.reply) return;
    if (proc.timer) clearTimeout(proc.timer);
    proc.timer = null;
    proc.job = null;
    let reply: Reply;
    try { reply = fromWire(m.reply); } catch (e) { reply = { error: { type: "other", message: String((e as Error)?.message ?? e) } }; }
    p.ok(reply);
    rest(proc);
    pump();
  });
  child.on("error", (e) => { console.error("[studio] file reader error", e.message); end(proc, "stopped"); });
  child.on("exit", () => { clearTimeout(start); end(proc, proc.ready ? "stopped" : "start"); });
  idle(proc);
  return proc;
}

/** No job: the process does not keep the server (or a test run) alive, and leaves after two idle minutes. */
function idle(proc: Proc) {
  proc.child.unref();
  (proc.child.channel as { unref?: () => void } | null | undefined)?.unref?.();
  (proc.child.stderr as { unref?: () => void } | null)?.unref?.();
}
function busy(proc: Proc) {
  proc.child.ref();
  (proc.child.channel as { ref?: () => void } | null | undefined)?.ref?.();
}
function rest(proc: Proc) {
  idle(proc);
  if (proc.idle) clearTimeout(proc.idle);
  proc.idle = setTimeout(() => { if (!proc.job) end(proc, null); }, IDLE_MS);
  proc.idle.unref();
}

/** A process is done with: killed, taken out of the pool, its job (if any) told why. */
function end(proc: Proc, why: "time" | "stopped" | "start" | null) {
  if (proc.gone) return;
  proc.gone = true;
  const i = P.procs.indexOf(proc);
  if (i >= 0) P.procs.splice(i, 1);
  for (const t of [proc.timer, proc.idle]) if (t) clearTimeout(t);
  try { proc.child.kill("SIGKILL"); } catch { /* already gone */ }
  const p = proc.job;
  proc.job = null;
  if (why === "start") {
    console.error("[studio] the file reader did not start:", proc.err.trim().slice(-600) || "(no message)");
    // with no reader running, what waits would only wait on another process that fails the same way
    const all = [...(p ? [p] : []), ...(P.procs.some((x) => x.ready) ? [] : P.queue.splice(0))];
    for (const q of all) { if (q.wait) clearTimeout(q.wait); q.no(new ParseLimitError("stopped", MSG.start())); }
    return;
  }
  if (p && why) {
    const L = parseLimits();
    const memory = why === "stopped" && (proc.err.includes(MEMORY_MARK) || /heap out of memory|Reached heap limit|Allocation failed/i.test(proc.err));
    const reason = why === "time" ? "time" : memory ? "memory" : "stopped";
    P.stopped[reason]++;
    if (reason === "stopped") console.error("[studio] the file reader stopped:", proc.err.trim().slice(-600) || "(no message)");
    p.no(new ParseLimitError(reason, reason === "time" ? MSG.time(L.seconds) : reason === "memory" ? MSG.memory() : MSG.stopped()));
  }
  pump();
}

function give(proc: Proc, p: Pending) {
  if (p.wait) clearTimeout(p.wait);
  if (proc.idle) clearTimeout(proc.idle);
  proc.idle = null;
  proc.job = p;
  busy(proc);
  proc.timer = setTimeout(() => end(proc, "time"), parseLimits().seconds * 1000);
  try { proc.child.send({ id: p.id, job: p.job }); } catch { end(proc, "stopped"); }
}

/** Waiting jobs to free processes; another process started while there is work and room. */
function pump() {
  const L = parseLimits();
  while (P.queue.length) {
    const free = P.procs.find((x) => x.ready && !x.job && !x.gone);
    if (!free) break;
    give(free, P.queue.shift()!);
  }
  let starting = P.procs.filter((x) => !x.ready).length;
  while (P.queue.length > starting && P.procs.length < L.procs && spawn()) starting++;
}

function run(job: Job): Promise<Reply> {
  return new Promise((ok, no) => {
    const L = parseLimits();
    if (P.queue.length >= L.queue) { P.stopped.busy++; return no(new ParseLimitError("busy", MSG.busy())); }
    const p: Pending = { id: ++P.seq, job, ok, no, wait: null };
    P.queue.push(p);
    p.wait = setTimeout(() => {
      const i = P.queue.indexOf(p);
      if (i < 0) return;
      P.queue.splice(i, 1);
      P.stopped.busy++;
      no(new ParseLimitError("busy", MSG.busy()));
    }, L.waitSeconds * 1000);
    pump();
  });
}

function thrown(r: Extract<Reply, { error: unknown }>): Error {
  const { type, message } = r.error;
  return type === "user" ? new UserError(message) : type === "parse" ? new ParseError(message) : new Error(message);
}

/** A file read in the reader: its tables, or the pictures to read with OCR (a picture, a scanned PDF's pages). Errors are thrown. */
export async function readInReader(buf: Buffer, name: string, contentType: string, base: string, o: { ocr: boolean; main: boolean }): Promise<{ tables: Table[] } | { ocr: { kind: "image" | "scan"; images: Buffer[]; skipped: number } }> {
  const job: FileJob = { op: "file", buf: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), name, contentType, base, ocr: o.ocr, main: o.main };
  const r = await run(job);
  if ("error" in r) throw thrown(r);
  if ("ocr" in r) return { ocr: { kind: r.ocr.kind, skipped: r.ocr.skipped, images: r.ocr.images.map((u) => Buffer.from(u.buffer, u.byteOffset, u.byteLength)) } };
  if ("tables" in r) return { tables: r.tables };
  throw new Error("The file reader answered with something else than tables.");
}

/**
 * A fetched page's facts (its title; an article, a sign-in, a CAPTCHA wall, a JavaScript app), worked out in the reader: the patterns
 * that find them backtrack on a crafted page (QA pass 7 reviewer). A page the reader had to stop (time, memory) has none of them: the
 * caller goes on as for a page with no title that is none of these. A busy reader is thrown as busy: answered "none", it turned a CAPTCHA
 * wall into "no data here" (QA pass 7 reviewer, round 2).
 */
export async function readFacts(html: string): Promise<PageFacts> {
  const none: PageFacts = { title: null, article: false, login: false, captcha: false, jsapp: false };
  try {
    const r = await run({ op: "facts", html });
    if ("facts" in r) return r.facts;
    if ("error" in r) throw thrown(r);
    return none;
  } catch (e) {
    if (e instanceof ParseLimitError && e.reason !== "busy") return none;
    throw e;
  }
}

/** A fetched web page read in the reader: its tables, feed, headlines, data-file links, the JSON its scripts load and its next page. */
export async function readPage(html: string, url: string): Promise<Page> {
  const r = await run({ op: "page", html, url });
  if ("error" in r) throw thrown(r);
  if ("page" in r) return r.page;
  throw new Error("The file reader answered with something else than a page.");
}
