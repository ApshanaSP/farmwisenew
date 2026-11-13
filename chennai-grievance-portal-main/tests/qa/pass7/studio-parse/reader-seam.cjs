/**
 * A test seam for the Studio's file reader (QA fixall, round 2), loaded into every reader the tests start through NODE_OPTIONS (the pool
 * keeps NODE_OPTIONS for the reader: parse-pool.ts readerEnv). The limits (time, memory, a held reader, a full queue) need a file the
 * reader cannot finish, and the crafted files that were one (a run of unclosed <Placemark>, a page of "<!--", a scan of 36 Mpx pages)
 * are read at once and within 20 x 9 MB since reviewer5-10 and reviewer2-13. A job whose file or page starts with
 *   QA-STUCK   holds its reader for ever (a reader stuck in a file)
 *   QA-FILL    fills memory outside V8's heap until the reader's watchdog ends it
 * Anything else goes to the reader as it is. Never loaded by the app.
 */
process.on("message", (m) => {
  const job = m && m.job;
  if (!job) return;
  const head = typeof job.html === "string" ? job.html.slice(0, 16)
    : job.buf ? Buffer.from(job.buf.buffer, job.buf.byteOffset, Math.min(job.buf.byteLength, 16)).toString("latin1") : "";
  if (head.startsWith("QA-STUCK")) for (;;) { /* stuck */ }
  if (head.startsWith("QA-FILL")) { const held = []; for (;;) held.push(Buffer.alloc(32 << 20, 1)); }
});
