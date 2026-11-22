/**
 * v13 (21 Nov, review finding 0-0): a request's own store statements are not queued behind background work. v12 put every pool statement
 * in one line, so /api/jarvis/hear's sign-in check waited for all 17 of a keep-warm's insights queries.
 */
import { describe, expect, it } from "vitest";
import { fgQueued, queryTurnForTest as queryTurn } from "./store";
import { inBackground, isBackground } from "@/lib/util/background";

/** a statement: holds the thread for `ms`, as node:sqlite does */
const hold = (ms: number) => { const t = Date.now(); while (Date.now() - t < ms) { /* the statement runs */ } };

describe("v13: the store's two queues", () => {
  it("a request's statement queued behind a background batch runs before the rest of that batch", async () => {
    const order: string[] = [];
    const batch = Array.from({ length: 8 }, (_, i) => inBackground(async () => { await queryTurn(); hold(15); order.push(`bg${i}`); }));
    const request = (async () => { await queryTurn(); hold(5); order.push("request"); })();
    await Promise.all([...batch, request]);
    expect(order.indexOf("request")).toBeLessThanOrEqual(1);
    expect(order.filter((o) => o.startsWith("bg"))).toEqual(["bg0", "bg1", "bg2", "bg3", "bg4", "bg5", "bg6", "bg7"]);
    expect(fgQueued()).toBe(0);
  });

  it("a request's own statements keep their order and one loop turn each; background ones too", async () => {
    const order: number[] = [];
    await Promise.all([0, 1, 2, 3].map((i) => (async () => { await queryTurn(); order.push(i); })()));
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("inBackground marks everything the work awaits; code outside it is a request's own", async () => {
    expect(isBackground()).toBe(false);
    const seen = await inBackground(async () => { await new Promise((r) => setImmediate(r)); return isBackground(); });
    expect(seen).toBe(true);
    expect(isBackground()).toBe(false);
  });
});
