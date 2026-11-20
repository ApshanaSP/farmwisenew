/**
 * v10: the window event `diq:map-cmd` (bridge.ts): Jarvis hands an op to the part of Ask the Map that owns its state; the answer comes back at
 * once (listeners run inside dispatchEvent), and null means no such part is on screen.
 */
import { describe, expect, it } from "vitest";
import { MAP_CMD, mapCmd, onMapCmd } from "./bridge";

describe("diq:map-cmd", () => {
  it("nobody listening: null (open the map first)", () => {
    expect(mapCmd("layer", { id: "schools", on: true }, new EventTarget() as unknown as Window)).toBe(null);
  });
  it("the owner answers its own ops, at once; another op is not its", () => {
    const w = new EventTarget() as unknown as Window;
    const seen: unknown[] = [];
    const off = onMapCmd(["layer", "heat"], (op, a) => { seen.push([op, a]); return { ok: true, state: { layers: ["schools"] } }; }, w);
    expect(mapCmd("layer", { id: "schools", on: true }, w)).toEqual({ ok: true, state: { layers: ["schools"] } });
    expect(seen).toEqual([["layer", { id: "schools", on: true }]]);
    expect(mapCmd("send", { dept: "GCC-SWD" }, w)).toBe(null);
    off();
    expect(mapCmd("layer", { id: "schools", on: false }, w)).toBe(null);
  });
  it("the event's detail is { op, args, reply }, named like the console's other events", () => {
    const w = new EventTarget() as unknown as Window;
    let detail: Record<string, unknown> | null = null;
    w.addEventListener(MAP_CMD, (e) => { detail = (e as CustomEvent).detail; (e as CustomEvent).detail.reply({ ok: false, why: "no-answer" }); });
    expect(MAP_CMD).toBe("diq:map-cmd");
    expect(mapCmd("exportSheet", {}, w)).toEqual({ ok: false, why: "no-answer" });
    expect(Object.keys(detail ?? {}).sort()).toEqual(["args", "op", "reply"]);
  });
});
