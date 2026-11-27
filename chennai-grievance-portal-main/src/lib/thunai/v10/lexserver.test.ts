/**
 * 27 Nov: the day's lexicon (v10/lexserver.ts) is never built on a request's path. The lexicon route answers at once with what is held (even
 * an older build's) or an empty list, and a build for the data's version starts in the background; a data-epoch move (the hosted copy's
 * 5-minute reload, a news sweep) keeps it; a new build's version builds it again. The store's stories and the data's version are doubles.
 */
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ version: "build-1", reads: 0, stories: [] as { id: string; title: string; t: string }[], /** the next read waits for it */ gate: null as Promise<void> | null, reading: 0, most: 0 }));
vi.mock("@/lib/collector/datakey", () => ({ dataVersion: async () => h.version }));
vi.mock("../v8/newsfind", () => ({ storeStories: async () => {
  h.reads++; h.reading++; h.most = Math.max(h.most, h.reading);
  const rows = h.stories, gate = h.gate;
  h.gate = null;
  try { if (gate) await gate; return rows; } finally { h.reading--; }
} }));
vi.mock("@/lib/collector/guard", () => ({ collectorSession: async () => ({ email: "c@example.invalid", userId: 1 }), failed: (e: unknown) => NextResponse.json({ error: String(e) }, { status: 500 }) }));
vi.mock("@/lib/thunai/world", () => ({ serverWorld: async () => WORLD }));

const WORLD = { zones: [{ n: 13, name: "Adyar", ta: null }], places: [{ name: "Kodungaiyur", aliases: [], zone: 1 }], taluks: [], depts: [{ code: "GCC", name: "Greater Chennai Corporation" }] } as never;
const { LEX_CHECK_MS, dayKeytermsNow, lexiconNow, resetLexicon, warmLexicon } = await import("./lexserver");
const { GET } = await import("@/app/api/collector/thunai/lexicon/route");
const { bumpDataEpoch } = await import("@/lib/collector/epoch");

/** lets the background build finish (it lets the thread go between slices) */
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
const names = (l: { kind: string; core: string }[] | null) => (l ?? []).filter((e) => e.kind === "storm" || e.kind === "name").map((e) => e.core).sort();

beforeEach(() => {
  resetLexicon();
  h.version = "build-1"; h.reads = 0; h.gate = null; h.reading = 0; h.most = 0;
  h.stories = [{ id: "d1", title: "Cyclone Akvan to cross the coast tomorrow", t: "2026-11-27 09:00" }, { id: "d2", title: "Governor Arlekar visits the city", t: "2026-11-27 08:00" }];
});
afterEach(() => { vi.useRealTimers(); });

describe("27 Nov: the lexicon route never builds on the request", () => {
  it("nothing held: an empty list at once, a build in the background, the names at the next ask", async () => {
    const r1 = await (await GET()).json();
    expect(r1).toEqual({ entities: [], building: true });
    await settle();
    expect(h.reads).toBe(1);
    const r2 = await (await GET()).json();
    expect(r2.building).toBeUndefined();
    expect(names(r2.entities)).toEqual(["Akvan", "Arlekar"]);
  });

  it("a data-epoch move keeps the lexicon; the hear route's keyterms come from it without waiting", async () => {
    expect(dayKeytermsNow(WORLD)).toBeNull();
    await settle();
    bumpDataEpoch(); bumpDataEpoch();
    expect(names(lexiconNow(WORLD))).toEqual(["Akvan", "Arlekar"]);
    expect(dayKeytermsNow(WORLD)).toContain("Akvan");
    await settle();
    expect(h.reads).toBe(1);
  });

  it("a new build: the older lexicon at once, the new one built in the background (the version looked at every 30 s at most)", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-27T04:00:00Z") });
    lexiconNow(WORLD);
    await settle();
    h.version = "build-2";
    h.stories = [{ id: "d3", title: "Cyclone Murasu nears the coast", t: "2026-11-27 10:00" }];
    // within the 30 s, the held one without a look at the version
    expect(names(lexiconNow(WORLD))).toEqual(["Akvan", "Arlekar"]);
    await settle();
    expect(h.reads).toBe(1);
    vi.setSystemTime(Date.now() + LEX_CHECK_MS);
    expect(names(lexiconNow(WORLD))).toEqual(["Akvan", "Arlekar"]); // answered at once with the older build's
    await settle();
    expect(h.reads).toBe(2);
    expect(names(lexiconNow(WORLD))).toEqual(["Murasu"]);
  });

  it("the keep-warm's step builds it once per version", async () => {
    expect(await warmLexicon(WORLD)).toBe(true);
    expect(await warmLexicon(WORLD)).toBe(false);
    h.version = "build-2";
    expect(await warmLexicon(WORLD)).toBe(true);
    expect(h.reads).toBe(2);
  });

  it("one build at a time: a new build's lexicon waits for the one running, and the older one never comes back over it", async () => {
    let open!: () => void;
    h.gate = new Promise<void>((r) => { open = r; });
    const first = warmLexicon(WORLD); // build-1's read of the store is slow
    await settle();
    h.version = "build-2";
    h.stories = [{ id: "d3", title: "Cyclone Murasu nears the coast", t: "2026-11-27 10:00" }];
    const second = warmLexicon(WORLD); // the swap's keep-warm pass, while build-1's is still running
    await settle();
    open();
    await Promise.all([first, second]);
    await settle();
    expect(names(lexiconNow(WORLD))).toEqual(["Murasu"]);
    expect(h.most).toBe(1);
  });
});

describe("27 Nov: the lexicon built in slices is the same lexicon", () => {
  it("buildLexiconYielding gives what buildLexicon gives, and other work runs between its slices", async () => {
    const { buildLexicon, buildLexiconYielding } = await import("./lexicon10");
    const NAMES = ["Arlekar", "Veeramani", "Akvan", "Akwan", "Murasu", "Kanimozhi", "Udhayanidhi", "Sekarbabu", "Rajendra", "Agrawal"];
    const stories = Array.from({ length: 400 }, (_, k) => ({ id: `s${k}`, t: `2026-11-${String(20 + (k % 7)).padStart(2, "0")} 10:00`,
      title: k % 9 === 0 ? `Cyclone ${NAMES[k % 4 === 0 ? 2 : 3]} nears the coast` : `${NAMES[k % NAMES.length]} meets ${NAMES[(k * 3) % NAMES.length]} over protest at the fire station`,
      titleEn: null }));
    let ticks = 0, done = false;
    const tick = () => { ticks++; if (!done) setImmediate(tick); };
    setImmediate(tick);
    const sliced = await buildLexiconYielding(stories, WORLD, { outlets: ["The Hindu"] });
    done = true;
    expect(sliced).toEqual(buildLexicon(stories, WORLD, { outlets: ["The Hindu"] }));
    expect(ticks).toBeGreaterThan(2);
    // "Akvan" and "Akwan" are one storm, as before (named by its most frequent spelling)
    const storms = sliced.filter((e) => e.kind === "storm");
    expect(storms).toHaveLength(1);
    expect(storms[0].spellings).toEqual(expect.arrayContaining(["Akvan", "Akwan"]));
  });
});
