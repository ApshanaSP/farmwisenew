/**
 * The rain action tracker: what the Collector asked a department to change at a place a past rain hit (a flooded street, a
 * jammed road, a ward that lost power, a late rail line), how far the department has got, and whether the place held in the
 * next comparable rain. Pure and browser-safe (no database, no server code): the stage machine, the outcome check, the
 * default department and note, and the summary. The rows themselves are rain rehearsal follow-ups (tasks.ts: a `followups`
 * row whose summary starts "[RR] {...}" and whose key starts "fix:"), and every step is an audit_log row, so no new table.
 *
 * Stages (one way, each step by one side):
 *   open -> assigned (Collector assigns) -> in action (officer posts an update) -> done (officer marks it done, with what was
 *   changed) -> verified (Collector checks it). The Collector may send a done fix back (it is in action again, with a note).
 *
 * Outcome at the next rain (worked out from that rain's own data, never typed in):
 *   flooded again  the place was hit in a rain that began after the work was done (any amount of rain);
 *   held           a rain that began after the work was done was comparable and the place was not hit in it;
 *   not tested     the work is not done, or no rain since, or only lighter rains, or that rain's reports are still coming in.
 * A rain is comparable when the rain at the place was at least COMPARABLE_SHARE of the rain that led to the action: the ward's
 * rain from the CFM-DSS gauges when both rains have it, else the district average, else the wettest gauge's figure, else
 * both being heavy-rain days in the record. The latest rain that tested the place decides; all are kept in `tests`.
 */

export type FixLens = "flood" | "traffic" | "power" | "metro";
export const FIX_LENSES: readonly FixLens[] = ["flood", "traffic", "power", "metro"];
export type Stage = "open" | "assigned" | "in_action" | "done" | "verified" | "closed";
export const STAGES: readonly Stage[] = ["open", "assigned", "in_action", "done", "verified", "closed"];
/** withdraw: the Collector closes a fix sent by mistake (the place is free for a new action); reassign: another department or due date */
export type Step = "assign" | "progress" | "done" | "verify" | "reopen" | "withdraw" | "reassign";
export const STEPS: readonly Step[] = ["assign", "progress", "done", "verify", "reopen", "withdraw", "reassign"];

/** who takes each step */
export const STEP_ROLE: Record<Step, "collector" | "officer"> = { assign: "collector", progress: "officer", done: "officer", verify: "collector", reopen: "collector", withdraw: "collector", reassign: "collector" };

const NEXT: Record<Stage, Partial<Record<Step, Stage>>> = {
  open: { assign: "assigned" },
  assigned: { progress: "in_action", done: "done", withdraw: "closed", reassign: "assigned" },
  in_action: { progress: "in_action", done: "done", withdraw: "closed", reassign: "assigned" },
  done: { verify: "verified", reopen: "in_action", withdraw: "closed" },
  verified: {},
  closed: {}
};

/** The stage a step leads to, or null when the step is not allowed from this stage. */
export function nextStage(from: Stage, step: Step): Stage | null {
  return NEXT[from][step] ?? null;
}

/** one step on a fix, oldest first (an audit_log row) */
export interface TrailEvent {
  step: Step;
  /** IST "YYYY-MM-DD HH:MM:SS" */
  at: string;
  by: string;
  /** the officer's words (what was done), or the Collector's note */
  remarks: string | null;
  /** "dir/name" of a site photo (served by /api/rehearsal/photo/dir/name) */
  photo: string | null;
  /** metres between the photo and the place, null = no location */
  photoM: number | null;
}

/**
 * A fix's stage: its trail replayed through the stage machine (a step that is not allowed from where it stands is ignored).
 * A row whose trail does not start with its assignment (written before the tracker) counts as assigned.
 */
export function stageOf(trail: Pick<TrailEvent, "step">[]): Stage {
  let s: Stage = trail[0]?.step === "assign" ? "open" : "assigned";
  for (const e of trail) s = nextStage(s, e.step) ?? s;
  return s;
}

/** past its due time and not finished */
export const isLate = (stage: Stage, due: string | null, now: string) => (stage === "assigned" || stage === "in_action") && !!due && due < now;

/** the time the work was finished: the last "done" after the last send-back (null while it is not done) */
export function doneAt(trail: TrailEvent[]): string | null {
  const st = stageOf(trail);
  if (st !== "done" && st !== "verified") return null;
  for (let k = trail.length - 1; k >= 0; k--) if (trail[k].step === "done") return trail[k].at;
  return null;
}

// ------------------------------------------------------------------ keys --

export const FIX_PREFIX = "fix:";
/** the task key of a fix: "fix:flood:n12|w3", "fix:power:ward:57" */
export const fixKey = (lens: FixLens, place: string) => `${FIX_PREFIX}${lens}:${place}`;
export function parseFixKey(k: string): { lens: FixLens; place: string } | null {
  const m = /^fix:(flood|traffic|power|metro):(.+)$/.exec(k);
  return m ? { lens: m[1] as FixLens, place: m[2] } : null;
}
/** a place key the summary header can carry safely ("} " ends the header, tasks.ts decodeSummary) */
export const PLACE_RE = /^[^\u0000-\u001f}\\]{1,140}$/;

// ------------------------------------------------------------------ rains --

/** what the outcome check needs of a rain (from the rains API: gauges per ward, the district average, the record's figure) */
export interface RainFact {
  id: string;
  start: string;
  end: string;
  /** district average from the CFM-DSS gauges (mm), null when the gauges have no record of it */
  districtMm: number | null;
  /** the record's figure for the rain day (the wettest gauge the pipeline or IMD reported, mm) */
  maxMm: number | null;
  /** rain per ward from the gauges (mm), keyed by ward number */
  wardMm: Record<string, number> | null;
  /** the gauge cache holds every day of the rain's window (a partly read window undercounts, so its gauge figures are not used) */
  complete?: boolean;
}
/** "none": no reliable figure in both rains, so the later rain cannot test the fix */
export type Basis = "ward" | "district" | "wettest" | "none";
/**
 * A gauge figure is a fair basis only when it is real rain: at least FLOOR_MM at the ward or over the district, and IMD's heavy-rain
 * mark (64.5 mm in a day) for the wettest gauge. A cause rain of a few mm would make any drizzle "comparable" (review, 28 Nov).
 */
export const FLOOR_MM = 20, WETTEST_FLOOR_MM = 64.5;
/** a later rain is comparable when the rain at the place was at least this share of the rain that led to the action */
export const COMPARABLE_SHARE = 0.7;
/** a rain's reports keep coming in until this many days after its last day (memory.ts RAIN_TAIL_DAYS) */
export const REPORT_TAIL_DAYS = 2;

const addDays = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10) + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
/** the last moment a rain's reports count for it (IST) */
export const reportsCloseAt = (r: { end: string }) => `${addDays(r.end, REPORT_TAIL_DAYS)} 23:59:59`;

const wardOf = (r: RainFact, ward: number | null) => (ward != null && ward > 0 && r.wardMm ? r.wardMm[String(ward)] ?? null : null);

/** How the rain at a place in a later rain compares with the rain that led to the action, on the best figure both rains have. */
export function compareRains(cause: RainFact, later: RainFact, ward: number | null): { comparable: boolean; basis: Basis; causeMm: number | null; laterMm: number | null } {
  const gauged = cause.complete !== false && later.complete !== false;
  const pairs: [Basis, number | null, number | null, number][] = [
    ["ward", gauged ? wardOf(cause, ward) : null, gauged ? wardOf(later, ward) : null, FLOOR_MM],
    ["district", gauged ? cause.districtMm : null, gauged ? later.districtMm : null, FLOOR_MM],
    ["wettest", cause.maxMm, later.maxMm, WETTEST_FLOOR_MM]
  ];
  for (const [basis, a, b, floor] of pairs) {
    if (a == null || b == null || a < floor) continue;
    return { comparable: b >= Math.max(COMPARABLE_SHARE * a, floor), basis, causeMm: Math.round(a * 10) / 10, laterMm: Math.round(b * 10) / 10 };
  }
  // no reliable figure in both rains: the later rain cannot say whether the fix held
  return { comparable: false, basis: "none", causeMm: null, laterMm: null };
}

/** a flooding report this close to where a street was acted on counts for it (an unnamed lane's key can change as the flood memory grows) */
export const NEAR_M = 100;
const KX = 111320 * Math.cos((13.05 * Math.PI) / 180), KY = 110574;
const metres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.hypot((a.lon - b.lon) * KX, (a.lat - b.lat) * KY);

/**
 * Was a street hit in a rain? A flooding report of the rain stood on it (its street key), or lies within NEAR_M of where the
 * action was taken, or the rain's satellite picture had water on it (the rain's merged street list, when there is one).
 */
export function floodHit(rain: { reports: { street: string | null; lat: number; lon: number }[]; streets?: { key: string }[] | null }, place: string,
  at: { lat: number; lon: number } | null): boolean {
  if (rain.reports.some((r) => r.street === place)) return true;
  if (rain.streets?.some((s) => s.key === place)) return true;
  return !!at && rain.reports.some((r) => metres(r, at) <= NEAR_M);
}

export type Outcome = "pending" | "held" | "again";
/**
 * One later rain against the fix:
 *   again    hit in it, after the work was done      held     comparable, not hit, its reports are all in
 *   lighter  not comparable and not hit (no test)    open     not hit so far, its reports are still coming in
 *   before   hit in it before the work was done (the fix was not in place yet)
 */
export interface RainTest { rain: string; result: "again" | "held" | "lighter" | "open" | "before" | "unknown"; basis: Basis; causeMm: number | null; laterMm: number | null }
export interface OutcomeView {
  kind: Outcome;
  /** the rain that decided it (held / again), else null */
  rain: string | null;
  /** why it is still pending: the work is not done, no rain since, only lighter rains, reports still coming in; "tested" when decided */
  why: "tested" | "not-done" | "no-rain" | "lighter" | "open" | "no-cause" | "no-figure";
  tests: RainTest[];
  /** every rain after the work in which the place flooded again (a later "held" never hides them) */
  againIn: string[];
}

/**
 * The outcome of a fix at the rains after the one that led to it. `hit(rainId)` says whether the place was hit in that rain
 * (Flooding: a flooding report on the street or near the place, or satellite water on it; the other tabs: the place is in that
 * rain's record). A rain counts as after the work when it began after the day the work was done.
 */
export function outcomeOf(fix: { rain: string; doneAt: string | null; ward: number | null }, rains: RainFact[], hit: (rainId: string) => boolean, now: string): OutcomeView {
  const cause = rains.find((r) => r.id === fix.rain);
  if (!cause) return { kind: "pending", rain: null, why: "no-cause", tests: [], againIn: [] };
  const later = rains.filter((r) => r.start > cause.end && r.start <= now.slice(0, 10)).sort((a, b) => a.start.localeCompare(b.start));
  const doneDay = fix.doneAt ? fix.doneAt.slice(0, 10) : null;
  const tests: RainTest[] = [];
  for (const r of later) {
    const c = compareRains(cause, r, fix.ward);
    const t = { rain: r.id, basis: c.basis, causeMm: c.causeMm, laterMm: c.laterMm };
    const wet = hit(r.id);
    if (!doneDay || r.start <= doneDay) { if (wet) tests.push({ ...t, result: "before" }); continue; }
    if (wet) tests.push({ ...t, result: "again" });
    else if (now <= reportsCloseAt(r)) tests.push({ ...t, result: "open" });
    else tests.push({ ...t, result: c.comparable ? "held" : c.basis === "none" ? "unknown" : "lighter" });
  }
  const againIn = tests.filter((t) => t.result === "again").map((t) => t.rain);
  const decisive = [...tests].reverse().find((t) => t.result === "again" || t.result === "held");
  if (decisive) return { kind: decisive.result as "again" | "held", rain: decisive.rain, why: "tested", tests, againIn };
  const why: OutcomeView["why"] = !doneDay ? "not-done" : tests.some((t) => t.result === "open") ? "open" : tests.some((t) => t.result === "lighter") ? "lighter"
    : tests.some((t) => t.result === "unknown") ? "no-figure" : "no-rain";
  return { kind: "pending", rain: null, why, tests, againIn };
}

// ------------------------------------------------------------------ summary --

export interface FixLike { id: number; lens: FixLens; place: string; stage: Stage; late: boolean; outcome: { kind: Outcome; rain: string | null } }

/** the newest fix of each place (a place acted on again after a later rain keeps only its newest) */
export function newestByPlace<T extends FixLike>(xs: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of xs) {
    const k = `${x.lens}|${x.place}`;
    const cur = m.get(k);
    if (!cur || x.id > cur.id) m.set(k, x);
  }
  return m;
}

export interface FixSummary {
  /** places acted on */
  places: number;
  assigned: number; inAction: number; done: number; verified: number; late: number; closed: number;
  held: number; again: number; pending: number;
  /** the rains that decided held / again, oldest first */
  testedIn: string[];
}

/** One tab's tracker in numbers: each place once (its newest fix). */
export function summarize(xs: FixLike[], lens: FixLens): FixSummary {
  const s: FixSummary = { places: 0, assigned: 0, inAction: 0, done: 0, verified: 0, late: 0, closed: 0, held: 0, again: 0, pending: 0, testedIn: [] };
  const rains = new Set<string>();
  for (const x of newestByPlace(xs.filter((y) => y.lens === lens)).values()) {
    // a withdrawn action is not a place acted on: it is counted apart and tested for nothing
    if (x.stage === "closed") { s.closed++; continue; }
    s.places++;
    if (x.stage === "assigned") s.assigned++;
    else if (x.stage === "in_action") s.inAction++;
    else if (x.stage === "done") s.done++;
    else if (x.stage === "verified") s.verified++;
    if (x.late) s.late++;
    if (x.outcome.kind === "held") s.held++;
    else if (x.outcome.kind === "again") s.again++;
    else s.pending++;
    if (x.outcome.rain) rains.add(x.outcome.rain);
  }
  s.testedIn = [...rains].sort();
  return s;
}

/** May a place get a new fix for this rain? Not while one is unfinished, and not twice for the same rain (a withdrawn one does not count). */
export function canAssign(existing: { rain: string; stage: Stage }[], rain: string): { ok: true } | { ok: false; why: "unfinished" | "same-rain" } {
  const live = existing.filter((x) => x.stage !== "closed");
  if (live.some((x) => x.stage !== "verified")) return { ok: false, why: "unfinished" };
  if (live.some((x) => x.rain === rain)) return { ok: false, why: "same-rain" };
  return { ok: true };
}

// ------------------------------------------------------------------ defaults --

/** the departments a rain fix can go to (store codes, ref_departments) */
export const FIX_DEPTS = ["GCC-SWD", "PWD-WRD", "GCC-ENG", "GCC-BRG", "GCC-MEC", "GCC-SWM", "GCC-PRK", "GCC-ELE", "CMWSSB", "TANGEDCO", "POL-GCP", "DIST-DM", "DIST-REV", "HLT-DMS"] as const;
/** days from today a fix is due by default (the Collector can change it) */
export const DUE_DAYS = 7;
/** the Rain tabs' own words for who does a job (impacts.ts jobs) -> store department. CMRL and Southern Railway have no
 *  officer account in District IQ: their jobs go to District Disaster Management, which takes them up with the operator. */
export const WHO_DEPT: Record<string, string> = {
  "Greater Chennai Traffic Police": "POL-GCP", "GCC Storm Water Drains": "GCC-SWD", "GCC Roads": "GCC-ENG", "TNPDCL (electricity)": "TANGEDCO",
  "GCC Parks": "GCC-PRK", "CMRL (Metro)": "DIST-DM", "Southern Railway": "DIST-DM"
};
const OPERATOR: Record<string, string> = { "CMRL (Metro)": "CMRL", "Southern Railway": "Southern Railway" };

const clip = (s: string, n = 300) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/**
 * A flooded street's default: an open drain complaint's own department; outside the Corporation's wards, District Disaster
 * Management (it takes the street up with the local body); otherwise Storm Water Drain. The note says what to change.
 */
export function floodDefault(s: { label: string; ward: number | null; water_m?: number | null; chokeDepts?: string[] }, rainWord: string): { dept: string; note: string } {
  const after = `flooded in the ${rainWord} rain`;
  const water = s.water_m != null && s.water_m <= 150 ? `; check its outfall to the canal or river ${Math.round(s.water_m)} m away` : "";
  const counts = new Map<string, number>();
  for (const d of s.chokeDepts ?? []) if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  const choke = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (choke) return { dept: choke, note: clip(`Clear the blocked drain reported on ${s.label} and desilt the drains along it before the next heavy rain (${after})${water}.`) };
  if (!s.ward) return { dept: "DIST-DM", note: clip(`${s.label} is outside the Corporation's wards: take it up with the local body to clear its drains before the next heavy rain (${after}).`) };
  return { dept: "GCC-SWD", note: clip(`Clear and desilt the storm-water drains along ${s.label} so water does not stand there in the next heavy rain (${after})${water}.`) };
}

/**
 * A Traffic, Power or Metro place's default, from the tab's own jobs for it: on a road where water stood, the drains;
 * where the road is broken, the roads department; otherwise the first job (a diversion, a transformer check, the operator).
 */
export function impactDefault(lens: Exclude<FixLens, "flood">, x: { label: string; kind: string; jobs: { who: string; en: string }[] }, hitWhy: string | null, rainWord: string): { dept: string; note: string } {
  const jobs = x.jobs ?? [];
  const pick = (re: RegExp) => jobs.find((j) => re.test(j.who));
  const job = lens === "traffic"
    ? (hitWhy && /water/i.test(hitWhy) ? pick(/Storm Water/) : null) ?? (hitWhy && /damage|broken|pothole/i.test(hitWhy) ? pick(/Roads/) : null) ?? jobs[0]
    : jobs[0];
  const what = lens === "traffic" ? "traffic jammed here" : lens === "power" ? "power went off here" : "trains ran late";
  const after = `${what} in the ${rainWord} rain${hitWhy ? `: ${hitWhy.toLowerCase()}` : ""}`;
  if (!job) {
    const dept = lens === "traffic" ? "POL-GCP" : lens === "power" ? "TANGEDCO" : "DIST-DM";
    return { dept, note: clip(`Find and fix what stopped ${x.label} in heavy rain (${after}).`) };
  }
  const dept = WHO_DEPT[job.who] ?? (lens === "power" ? "TANGEDCO" : lens === "traffic" ? "POL-GCP" : "DIST-DM");
  const via = OPERATOR[job.who] ? `Take up with ${OPERATOR[job.who]}: ` : "";
  return { dept, note: clip(`${via}${job.en.replace(/\.$/, "")} (${after}).`) };
}

/** the default due day: DUE_DAYS after today (IST) */
export const defaultDue = (now: string) => addDays(now, DUE_DAYS);
