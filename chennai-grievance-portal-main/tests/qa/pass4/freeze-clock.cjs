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
  globalThis.Date = FakeDate;
}
