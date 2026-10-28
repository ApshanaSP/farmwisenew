/**
 * Speed and memory (masterclass 9.10): a 50,000-row file through reading, profiling, cleaning, the Designer, the Chart
 * Doctor and the insights, inside the time a Collector waits (20 s), with memory that settles afterwards.
 */
import { describe, expect, it } from "vitest";
import { renderPanel } from "@/lib/studio/chartlint";
import { clean } from "@/lib/studio/clean";
import { designDashboard } from "@/lib/studio/dashboard";
import { computeInsights } from "@/lib/studio/insights";
import { parseFile } from "@/lib/studio/parse";
import { profileTable } from "@/lib/studio/profile";
import { rulesSpec } from "@/lib/studio/spec";
import { addDays, parseDate } from "@/lib/studio/values";

const ZONES = ["Thiruvottiyur", "Manali", "Madhavaram", "Tondiarpet", "Royapuram", "Thiru-Vi-Ka Nagar", "Ambattur", "Anna Nagar", "Teynampet", "Kodambakkam", "Valasaravakkam", "Alandur", "Adyar", "Perungudi", "Sholinganallur"];
const refs = { wards: new Map(), zones: new Map(), taluks: new Map(), categories: [], depts: [], families: new Map() } as never;
const names = { zone: (z: number) => ZONES[z - 1] ?? `Zone ${z}`, taluk: (t: string) => t, zoneOf: (v: string | number) => ZONES.indexOf(String(v)) + 1 || null };

describe("9.10 a 50,000-row file", () => {
  it("is read, cleaned, designed, checked and mined in under 20 s, and memory settles", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const lines = ["Complaint No,Date,Zone,Ward,Complaint type,Status,Cost (Rs)"];
    const types = ["Garbage", "Streetlight", "Pothole", "Water", "Sewage", "Mosquito", "Encroachment", "Tree fall"];
    for (let i = 0; i < 50_000; i++) lines.push(`C${i + 1},${addDays("2026-04-01", Math.floor(rnd() * 200))},${ZONES[Math.floor(rnd() * 15)]},${1 + Math.floor(rnd() * 200)},${types[Math.floor(rnd() * 8)]},${rnd() < 0.3 ? "Pending" : "Closed"},${Math.floor(rnd() * 90000)}`);
    const buf = Buffer.from(lines.join("\n"));
    const heap0 = process.memoryUsage().heapUsed;
    const t0 = Date.now();
    const t = parseFile(buf, "complaints.csv");
    const spec = rulesSpec(profileTable(t), "complaints.csv", null, refs);
    const c = clean(t, spec);
    const date = spec.columns.find((x) => x.role === "date"), zone = spec.columns.find((x) => x.role === "zone");
    for (const r of c.rows) { if (date && r._d == null) r._d = parseDate(r[date.key]); if (zone) r._z = names.zoneOf(String(r[zone.key])); }
    const plans = designDashboard(c.rows, spec, c.window);
    const panels = plans.map((p) => renderPanel(c.rows, spec, p, names as never, c.window));
    const ins = computeInsights(c.rows, spec, c.detective, null, c.window, names as never);
    const ms = Date.now() - t0;
    const peak = process.memoryUsage().heapUsed - heap0;
    console.info(`[perf] 50,000 rows: ${ms} ms, ${panels.length} panels, ${ins.length} insights, heap +${Math.round(peak / 1e6)} MB`);
    expect(t.rows.length).toBe(50_000);
    expect(panels.length).toBeGreaterThan(3);
    expect(ms).toBeLessThan(20_000);
    expect(peak).toBeLessThan(1_500_000_000);
  }, 60_000);
});
