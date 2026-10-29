/**
 * An honest check: 36 commands written AFTER the rules were finished, in new phrasings, and never used to tune them.
 * The score is reported, not forced: a miss here goes to the Nova Lite fallback in the console. Do not add these phrases
 * to the lexicon to raise the number; write new unseen ones instead.
 */
import { describe, expect, it } from "vitest";
import { WORLD, withState } from "./fixture";
import type { Step } from "./types";
import { understand } from "./understand";

const inc = { incident: "INC-1" };
const CASES: [string, Step[] | "ask" | "refuse", object?][] = [
  ["take me to trends", [{ a: "page", page: "trends" }]],
  ["let's look at the environment page", [{ a: "page", page: "environment" }]],
  ["filter by Royapuram", [{ a: "view", view: { zone: 5 } }]],
  ["just the police complaints", [{ a: "view", view: { dept: "POL-GCP" } }]],
  ["only high severity please", [{ a: "view", view: { sev: "High" } }]],
  ["switch the period to quarterly", [{ a: "period", period: "quarterly" }]],
  ["show me the last 90 days", [{ a: "period", period: "quarterly" }]],
  ["mosquito complaints in Valasaravakkam", [{ a: "view", view: { zone: 11, cat: "VECTOR_DISEASE" } }]],
  ["reset everything", [{ a: "view", view: { zone: null, dept: null, cat: null, taluk: null, sev: null } }]],
  ["open the second one", [{ a: "item", which: 2 }]],
  ["undo that", [{ a: "undo", n: 1 }]],
  ["take it back two steps", [{ a: "undo", n: 2 }]],
  ["turn the lights off", [{ a: "theme", theme: "dark" }]],
  ["mute yourself", [{ a: "mode", mode: "visual" }]],
  ["what's the level at Puzhal", [{ a: "read", what: "reservoir", name: "Puzhal" }]],
  ["hospitals close to this incident", [{ a: "map", q: "hospitals close to this incident" }], inc],
  ["which wards had the most complaints last week", [{ a: "ask", q: "which wards had the most complaints last week" }]],
  ["open data sources", [{ a: "panel", panel: "sources" }]],
  ["show me departments", [{ a: "panel", panel: "depts" }]],
  ["Tondiarpet streetlights", [{ a: "view", view: { zone: 4, cat: "STREETLIGHT_ELECTRICAL" } }]],
  ["மாதவரம் மண்டலம் காட்டு", [{ a: "view", view: { zone: 3 } }]],
  ["பத்தாவது மண்டலம்", [{ a: "view", view: { zone: 10 } }]],
  ["மாத வாரியாக காட்டு", [{ a: "period", period: "monthly" }]],
  ["போக்குவரத்து புகார்கள் மட்டும்", [{ a: "view", view: { cat: "TRAFFIC_OBSTRUCTION" } }]],
  ["காலாண்டு பார்வை", [{ a: "period", period: "quarterly" }]],
  ["எல்லாம் மூடு", [{ a: "close", all: true }]],
  ["இருண்ட தீம்", [{ a: "theme", theme: "dark" }]],
  ["எண்கள் மறை", [{ a: "numbers", show: false, names: false }]],
  ["Royapuram-la sewage evlo", [{ a: "view", view: { zone: 5, cat: "DRAINAGE_SEWAGE" } }]],
  ["Anna Nagar-ku po", [{ a: "view", view: { zone: 8 } }]],
  ["quarterly-ku maathu", [{ a: "period", period: "quarterly" }]],
  ["severe mattum kaatu", [{ a: "view", view: { sev: "Severe" } }]],
  ["page down", [{ a: "scroll", dir: "down" }]],
  ["Studio open pannu", [{ a: "page", page: "studio" }]],
  ["Velachery taluk", [{ a: "view", view: { taluk: "TLK-VLC" } }]],
  ["erase the database", "refuse"]
];

describe("Thunai on unseen phrasings (reported, not forced)", () => {
  it("reports its accuracy on commands it was not tuned on", () => {
    const misses: string[] = [];
    for (const [text, expect_, st] of CASES) {
      const r = understand(text, withState(st ?? {}), WORLD);
      const ok = typeof expect_ === "string" ? r.kind === expect_ : r.kind === "do" && JSON.stringify(r.steps) === JSON.stringify(expect_);
      if (!ok) misses.push(`${text} → ${r.kind === "do" ? JSON.stringify(r.steps) : r.kind}`);
    }
    const pct = Math.round(((CASES.length - misses.length) / CASES.length) * 1000) / 10;
    console.log(`Thunai unseen: ${pct}% of ${CASES.length} by rules alone (the console sends the rest to Nova Lite)\n  ${misses.join("\n  ")}`);
    expect(CASES.length).toBe(36);
  });
});
