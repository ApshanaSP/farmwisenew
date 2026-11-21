/**
 * v12 (21 Nov): the slow reads are kept by the data's version, the data epoch and a one-minute bucket (datakey.ts), not by the console's
 * "now", which moved every 30 s: the warm-up was a miss for the first question and every pause of 30 s made the next one slow again.
 */
import { afterEach, describe, expect, it } from "vitest";
import { bumpDataEpoch } from "./epoch";
import { BACK_BUCKETS, BUCKET_MS, dataKey, dataVersion, keptRead, type Kept } from "./datakey";
import { isBackground } from "@/lib/util/background";

afterEach(() => { globalThis.__diqDataVersion = undefined; });

const T0 = 1_763_700_000_000 - (1_763_700_000_000 % BUCKET_MS); // a bucket's first ms
const later = (ms: number) => T0 + ms;
const deferred = <T,>() => { let res!: (v: T) => void, rej!: (e: unknown) => void; const p = new Promise<T>((a, b) => { res = a; rej = b; }); return { p, res, rej }; };

describe("v12: keptRead", () => {
  it("the same bucket and base: one read, shared", async () => {
    const cache = new Map<string, Kept<number>>();
    let runs = 0;
    const run = async () => ++runs;
    expect(await keptRead(cache, "b", run, { now: later(1000) })).toBe(1);
    expect(await keptRead(cache, "b", run, { now: later(50_000) })).toBe(1);
    expect(runs).toBe(1);
  });

  it("a new minute: the last minute's settled copy answers at once while this minute's is worked out, then this minute's", async () => {
    const cache = new Map<string, Kept<string>>();
    await keptRead(cache, "b", async () => "minute 0", { now: later(10_000) });
    const next = deferred<string>();
    // the recompute is out: the question is not made to wait for it
    expect(await keptRead(cache, "b", () => next.p, { now: later(BUCKET_MS + 5_000) })).toBe("minute 0");
    next.res("minute 1");
    await next.p; await Promise.resolve();
    expect(await keptRead(cache, "b", async () => "never", { now: later(BUCKET_MS + 9_000) })).toBe("minute 1");
  });

  it("`fresh` waits for this minute's copy (the keep-warm runs its steps one after another)", async () => {
    const cache = new Map<string, Kept<string>>();
    await keptRead(cache, "b", async () => "old", { now: later(0) });
    expect(await keptRead(cache, "b", async () => "new", { now: later(BUCKET_MS), fresh: true })).toBe("new");
  });

  it("an older copy answers for at most BACK_BUCKETS minutes; past that the question waits for the read", async () => {
    const cache = new Map<string, Kept<string>>();
    await keptRead(cache, "b", async () => "old", { now: later(0) });
    const far = later((BACK_BUCKETS + 1) * BUCKET_MS);
    expect(await keptRead(cache, "b", async () => "now", { now: far })).toBe("now");
  });

  it("another base (a new build, a moved epoch, another scope) never answers from this one's copy", async () => {
    const cache = new Map<string, Kept<string>>();
    await keptRead(cache, "build-1|0|daily", async () => "build 1", { now: later(0) });
    expect(await keptRead(cache, "build-2|0|daily", async () => "build 2", { now: later(BUCKET_MS) })).toBe("build 2");
    expect(await keptRead(cache, "build-1|1|daily", async () => "epoch 1", { now: later(BUCKET_MS) })).toBe("epoch 1");
  });

  it("v13: a recompute that an older copy answers for is background work; one the caller waits for is not", async () => {
    const cache = new Map<string, Kept<boolean>>();
    expect(await keptRead(cache, "b", async () => isBackground(), { now: later(0) })).toBe(false); // nothing to answer with: waited for
    let refreshBg: boolean | null = null;
    await keptRead(cache, "b", async () => { refreshBg = isBackground(); return true; }, { now: later(BUCKET_MS + 1) });
    await new Promise((r) => setImmediate(r));
    expect(refreshBg).toBe(true); // the last bucket's copy answered; the new one queues behind requests' own statements
    let warmBg: boolean | null = null;
    await keptRead(cache, "b", async () => { warmBg = isBackground(); return true; }, { now: later(2 * BUCKET_MS + 1), fresh: true });
    expect(warmBg).toBe(false); // `fresh` waits for it: its caller's own (the keep-warm marks itself)
  });

  it("v13: the bucket is 5 minutes, longer than the keep-warm's 75 s tick, and an older copy answers for one bucket", () => {
    expect(BUCKET_MS).toBe(300_000);
    expect(BACK_BUCKETS).toBe(1);
  });

  it("a failed read is not kept: the next call reads again", async () => {
    const cache = new Map<string, Kept<string>>();
    await expect(keptRead(cache, "b", async () => { throw new Error("store down"); }, { now: later(0) })).rejects.toThrow(/store down/);
    await Promise.resolve();
    expect(await keptRead(cache, "b", async () => "ok", { now: later(10) })).toBe("ok");
  });
});

describe("v12: dataVersion and dataKey", () => {
  it("the build's id, read once per epoch; a moved epoch reads it again and changes the key", async () => {
    let reads = 0, build = "build-A";
    const read = async () => { reads++; return { build_id: build, exported_at: "2026-11-21 06:00:00" }; };
    expect(await dataVersion(read)).toBe("build-A");
    build = "build-B";
    expect(await dataVersion(read)).toBe("build-A"); // same epoch, same minute: not read again
    expect(reads).toBe(1);
    const k1 = await dataKey(read);
    bumpDataEpoch();
    const k2 = await dataKey(read);
    expect(k2).not.toBe(k1);
    expect(k2.startsWith("build-B|")).toBe(true);
    expect(reads).toBe(2);
  });

  it("no build id: the export time; nothing readable: an empty version (the epoch and the bucket still key)", async () => {
    expect(await dataVersion(async () => ({ exported_at: "2026-11-21 06:00:00" }))).toBe("2026-11-21 06:00:00");
    globalThis.__diqDataVersion = undefined;
    expect(await dataVersion(async () => { throw new Error("no _export_meta"); })).toBe("");
  });
});
