/**
 * v12 (21 Nov): a deadline that always fires. Server and browser.
 *
 * Why: on this PC's Node (v22.14) a timer signal made with AbortSignal.timeout and held only through AbortSignal.any([..., timeout]) is
 * garbage-collected and never aborts (the timer keeps only a weak reference to it, and the composite keeps only weak references to its
 * sources). Planner calls with a 6 s cap ran 25 and 44 s on 21 Nov and ended only when the Collector spoke again (the root-cause report,
 * stale-and-double RC6; reproduced with --expose-gc). Here the timer's own callback holds the controller, so it is kept alive until it fires
 * or done() clears it, and a parent's abort is forwarded with a listener (the pattern web/fetch.ts already uses).
 *
 *   const dl = deadline(6000, turnSignal);
 *   try { await work(dl.signal); } finally { dl.done(); }
 *
 * The signal aborts at the deadline with a DOMException named "TimeoutError" (what AbortSignal.timeout gives, so fetch rejects with the
 * same error and the callers' "timeout" checks still read it), or when any parent aborts, with that parent's own reason.
 */
export interface Deadline {
  /** aborts at the deadline or when a parent aborts */
  readonly signal: AbortSignal;
  /** true once the deadline itself passed (not a parent's abort) */
  readonly timedOut: boolean;
  /** stops the timer and lets go of the parents; call it once the work is over (in a finally) */
  done(): void;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * A deadline `ms` from now (Infinity, or a value that is not a finite number: no timer, the parents only), stopped by any of `parents`
 * too. A parent that has already aborted aborts it at once.
 */
export function deadline(ms: number, ...parents: (AbortSignal | null | undefined)[]): Deadline {
  const ac = new AbortController();
  let timer: Timer | null = null;
  let timedOut = false;
  const offs: (() => void)[] = [];
  const done = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    for (const off of offs.splice(0)) off();
  };
  for (const p of parents) {
    if (!p) continue;
    if (p.aborted) { ac.abort(p.reason); break; }
    const on = () => { ac.abort(p.reason); done(); };
    p.addEventListener("abort", on, { once: true });
    offs.push(() => p.removeEventListener("abort", on));
  }
  if (ac.signal.aborted) done();
  else if (Number.isFinite(ms)) {
    // the closure holds `ac`, and the timer list holds the closure: nothing here can be collected before it fires
    timer = setTimeout(() => {
      timer = null;
      timedOut = true;
      ac.abort(new DOMException(`no answer in ${Math.round(ms)} ms`, "TimeoutError"));
      done();
    }, Math.max(0, ms));
    // a waiting deadline never keeps a script or a test process alive on its own (the timer is still strongly held)
    (timer as { unref?: () => void }).unref?.();
  }
  return { signal: ac.signal, get timedOut() { return timedOut; }, done };
}

/** Is this error the deadline's (a TimeoutError), not a cancel? */
export const isTimeout = (e: unknown): boolean => (e as { name?: string } | null)?.name === "TimeoutError";
