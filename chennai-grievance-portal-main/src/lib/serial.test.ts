import { describe, expect, it } from "vitest";
import { oneAtATime } from "./serial";

describe("one request at a time per citizen (double-submitted complaints)", () => {
  it("runs the second only after the first has finished, and others in parallel", async () => {
    const log: string[] = [];
    const job = async (key: string, name: string, ms: number) => {
      const release = await oneAtATime(key);
      log.push(`${name} start`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`${name} end`);
      release();
    };
    await Promise.all([job("u1", "a", 30), job("u1", "b", 1), job("u2", "c", 1)]);
    expect(log.indexOf("b start")).toBeGreaterThan(log.indexOf("a end"));
    expect(log.indexOf("c end")).toBeLessThan(log.indexOf("a end"));
  });

  it("a failed first request still lets the next one in", async () => {
    const r1 = await oneAtATime("u3");
    const second = oneAtATime("u3");
    r1(); // released from a finally block, whatever happened
    await expect(second.then((r) => (r(), "ran"))).resolves.toBe("ran");
  });
});
