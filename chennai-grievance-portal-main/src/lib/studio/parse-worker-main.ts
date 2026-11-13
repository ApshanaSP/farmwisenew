/**
 * The entry of the Data Studio's file-reader process (scripts/studio-parse-worker.mjs, started by parse-pool.ts; QA pass 7). It reads one
 * job at a time from the server and answers each.
 *
 * The memory limit has two parts. V8's heap is capped by the flag the server starts this process with (--max-old-space-size): past it the
 * process ends with "heap out of memory". The bytes outside V8's heap (the Buffers an inflate fills: a 1.5 MB workbook made SheetJS fill
 * 1.5 GB) no flag caps, so a watchdog on its own thread checks the process's memory every 50 ms and ends the process past the cap. It runs
 * while this thread is held in a parser. Either way only this process ends, never the server: a worker thread's resourceLimits could not
 * promise that (a large allocation near its limit aborted the whole process: "FATAL ERROR: Reached heap limit").
 */
import { Worker } from "node:worker_threads";
import { MEMORY_MARK, toWire, work, type Job, type Reply } from "@/lib/studio/parse-worker";

const WATCHDOG = `
const { workerData } = require("node:worker_threads");
const fs = require("node:fs");
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
setInterval(() => {
  // the server is gone (it crashed or was killed while this process was held in a parser, so "disconnect" could not run): this process
  // goes too, never left reading for ever. On Linux an orphan is given a new parent; on any system the old one stops answering.
  if (process.ppid !== workerData.parent || !alive(workerData.parent)) process.kill(process.pid, "SIGKILL");
  const rss = process.memoryUsage.rss();
  if (rss <= workerData.cap) return;
  try { fs.writeSync(2, "\\n" + workerData.mark + " (" + Math.round(rss / 1048576) + " MB)\\n"); } catch {}
  process.kill(process.pid, "SIGKILL");
}, 50);
`;

const capMb = Number(process.env.STUDIO_PARSE_RSS_MB) || 1536;
new Worker(WATCHDOG, { eval: true, workerData: { cap: capMb * 1024 * 1024, mark: MEMORY_MARK, parent: process.ppid } }).unref();

const send = (m: unknown) => { try { process.send?.(m); } catch { /* the server went away */ } };

process.on("message", (m: { id: number; job: Job }) => {
  let reply: Reply;
  try { reply = work(m.job); } catch (e) { reply = { error: { type: "other", message: String((e as Error)?.message ?? e) } }; }
  // tables go packed (each text once): parse-worker.ts toWire
  send({ id: m.id, reply: toWire(reply) });
});
// the server closed the channel (it stopped, or it let this process go when idle)
process.on("disconnect", () => process.exit(0));
send({ ready: true });
