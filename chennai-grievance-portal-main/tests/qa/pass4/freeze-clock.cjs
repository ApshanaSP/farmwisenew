// QA pass 4: freezes (or shifts) the clock in a test server or process, through NODE_OPTIONS=--require, so production code is untouched.
//   QA_FROZEN_NOW=<ISO>            Date.now() and new Date() always give that moment
//   QA_FROZEN_NOW=<ISO> QA_CLOCK_TICKING=1   the clock starts at that moment and runs on (for rate limits and time travel over HTTP)
// The store's NOW() and CURDATE() are JS functions built on Date (lib/aws/dialect.ts), so they follow. Timers are not touched.
const at = Date.parse(process.env.QA_FROZEN_NOW || "");
if (!Number.isNaN(at)) {
  const Real = Date;
  const started = Real.now();
  const ticking = process.env.QA_CLOCK_TICKING === "1";
  const now = () => (ticking ? at + (Real.now() - started) : at);
  class FakeDate extends Real {
    constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
    static now() { return now(); }
  }
  // Next 15 re-wraps Date from its OWN properties only (node-environment-extensions/date.js), so the statics a subclass inherits (UTC, parse) are lost: own copies
  FakeDate.UTC = Real.UTC;
  FakeDate.parse = Real.parse;
  globalThis.Date = FakeDate;

  // SQLite's own clock follows too (QA pass 6, P6-001). datetime('now') in a test schema's DEFAULT or a test's INSERT read the wall
  // clock while the store's NOW() read the moved one, so tests that mixed them failed under a moved clock. Every node:sqlite database
  // opened in this process gets datetime/date/time/julianday/strftime/unixepoch back with 'now' (or no time) read from the moved
  // clock; any other value is passed to SQLite's own function, on a helper connection. CURRENT_TIMESTAMP is a keyword and stays real.
  try {
    const sqlite = require("node:sqlite");
    const RealDb = sqlite.DatabaseSync;
    const helper = new RealDb(":memory:");
    const stmts = new Map();
    const iso = () => new Real(now()).toISOString().replace("T", " ").replace("Z", "");
    const DATE_FNS = ["datetime", "date", "time", "julianday", "unixepoch"];
    const call = (name, args) => {
      const key = `${name}/${args.length}`;
      let st = stmts.get(key);
      if (!st) stmts.set(key, (st = helper.prepare(`SELECT ${name}(${args.map(() => "?").join(", ")}) AS v`)));
      return st.get(...args).v;
    };
    const isNow = (v) => typeof v === "string" && v.trim().toLowerCase() === "now";
    class FrozenClockDb extends RealDb {
      constructor(...a) {
        super(...a);
        for (const name of DATE_FNS) this.function(name, { varargs: true }, (...args) => call(name, args.length ? args.map((v, i) => (i === 0 && isNow(v) ? iso() : v)) : [iso()]));
        // strftime(format, time, ...): the time is the second argument
        this.function("strftime", { varargs: true }, (...args) => call("strftime", args.length === 1 ? [args[0], iso()] : args.map((v, i) => (i === 1 && isNow(v) ? iso() : v))));
      }
    }
    sqlite.DatabaseSync = FrozenClockDb;
    require("node:module").syncBuiltinESMExports();
  } catch { /* no node:sqlite in this Node: nothing to follow */ }
}
