// g-repair (RC-16 getters): a reminder with no time heard is tomorrow at 10:00 Chennai time on a server in any zone.
import { describe, expect, it } from "vitest";
import { WORLD } from "./fixture";
import { understand } from "./understand";
import type { ScreenState } from "./types";

const NOW = Date.parse("2026-11-06T06:30:00Z"); // 6 Nov, 12:00 in Chennai
const state = { page: "overview", period: "weekly", zone: null, dept: null, cat: null, taluk: null, sev: null, mapMode: "zones", panel: null, incident: null, listLength: 0, lastPlace: null, numbers: false, now: NOW } as unknown as ScreenState;

describe("a reminder with no time", () => {
  it("is set for tomorrow at 10:00 in Chennai, on a UTC server and on a Los Angeles server", () => {
    const saved = process.env.TZ;
    try {
      for (const tz of ["Asia/Kolkata", "UTC", "America/Los_Angeles", "Pacific/Auckland"]) {
        process.env.TZ = tz;
        const r = understand("remind me to call the zonal officer", state, WORLD);
        const step = r.kind === "do" ? r.steps.find((s) => s.a === "remind") : undefined;
        expect(step && step.a === "remind" ? step.at : null, tz).toBe("2026-11-07T04:30:00.000Z");
      }
    } finally { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; }
  });
});

describe("close is about a panel, not a record", () => {
  const steps = (t: string) => { const r = understand(t, state, WORLD); return r.kind === "do" ? r.steps.map((s) => s.a) : [r.kind]; };
  it("a panel by any of its names is closed", () => {
    for (const t of ["close", "close it", "close this", "close this panel", "close the panel", "close the incident panel", "close the detail panel", "dismiss the window", "please close the map", "close the popup", "close this drawer"])
      expect(steps(t), t).toEqual(["close"]);
  });
  it("a record is never closed from here: the order is refused or handed on, no close step", () => {
    for (const t of ["close the case", "close this complaint", "close all overdue cases", "close the incident", "close the ticket"]) expect(steps(t), t).not.toContain("close");
  });
});
