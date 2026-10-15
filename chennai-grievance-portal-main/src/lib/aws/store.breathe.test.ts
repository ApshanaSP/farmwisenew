import { describe, expect, it } from "vitest";
import { breathe } from "./store";

describe("store loading yields to waiting requests", () => {
  it("pauses once every 2,000 rows and not in between", async () => {
    let paused = 0;
    for (let i = 0; i < 10_000; i++) { const p = breathe(); if (p) { paused++; await p; } }
    expect(paused).toBe(5);
  });

  it("a request queued during a long load runs before the load finishes", async () => {
    const order: string[] = [];
    setImmediate(() => order.push("request"));
    for (let i = 0; i < 6_000; i++) await breathe();
    order.push("load done");
    expect(order).toEqual(["request", "load done"]);
  });
});
