// QA pass 4, fixer G2, RC-15: spoken lines and Tamil lines in English or with wrong wording. Unit tests and class guards (no database, no server).
//   PB-281 a reminder card showed a raw UTC string        PB-282 the Tamil forget question was the fragment "மற"
//   PB-299 a status "Open" read as the verb "திற"          PB-300 fixed labels on the Tamil Briefing stayed English
//   PB-302 "Severe severity"                               PB-303 a raw ISO day "2026-11-07" in the cyclone popover
//   PB-317 a High case said "Not severe" in the close box  PB-207 the Tamil brief read English reasons and conditions
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TA, TA_CTX } from "@/lib/i18n/ta";
import { sevIncident, sevLabel } from "@/lib/sev-label";
import { conditionsTa, reasonTa } from "./reasons";
import { confirmLine, whenText } from "./say";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const walk = (d: string): string[] => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
const LATIN_WORDS = /[A-Za-z]{3,}/;
const TAMIL = /[஀-௿]/;

describe("PB-302, PB-317: a severity reads as what it is", () => {
  it("Severe is never 'Severe severity'; the other levels name the level", () => {
    expect(sevLabel("Severe")).toBe("Severe");
    expect(sevLabel("severe")).toBe("Severe");
    expect(sevLabel("High")).toBe("High severity");
    expect(sevLabel("Medium")).toBe("Medium severity");
    expect(sevLabel(null)).toBe("");
    expect(sevIncident("Severe")).toBe("Severe incident");
    expect(sevIncident("Low")).toBe("Low-severity incident");
    expect(sevIncident(undefined)).toBe("Incident");
  });
  it("class guard: no screen or answer glues the word 'severity' after a level it reads from the data", () => {
    const hits: string[] = [];
    for (const f of [...walk("src/components"), ...walk("src/lib/assistant"), ...walk("src/lib/thunai")].filter((x) => /\.(ts|tsx)$/.test(x) && !/\.test\./.test(x))) {
      read(f).split("\n").forEach((l, i) => { if (/\$?\{[^{}]*\.sev(?:erity)?(?: as string)?\}\s*(?:-)?severity/.test(l)) hits.push(`${f}:${i + 1}`); });
    }
    expect(hits, "use sevLabel() / sevIncident() from src/lib/sev-label.ts").toEqual([]);
  });
  it("the close box does not call a High case 'not severe': it says the level and who closes it", () => {
    const s = read("src/components/officer/Report.tsx");
    expect(s).not.toMatch(/Not severe: your department/);
    expect(s).toMatch(/sevLabel\(row\.sev\)/);
  });
});

describe("PB-281: a time a person can read, in Chennai time", () => {
  it("English and Tamil, never the ISO string, never Latin AM or PM in a Tamil line", () => {
    const iso = "2026-11-06T11:30:00.000Z"; // 5:00 pm in Chennai
    expect(whenText(iso, "en")).toMatch(/6 Nov/);
    expect(whenText(iso, "en")).toMatch(/5:00\s?pm/i);
    expect(whenText(iso, "en")).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    const ta = whenText(iso, "ta");
    expect(ta).toMatch(TAMIL);
    expect(ta).not.toMatch(/\b(AM|PM)\b/i);
    expect(ta).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
  it("a missing or broken time is said in words", () => {
    expect(whenText(undefined, "en")).toBe("at the time you said");
    expect(whenText("not a date", "ta")).toMatch(TAMIL);
  });
  it("the question before a reminder carries that text, in both languages", () => {
    const en = confirmLine({ a: "remind", at: "2026-11-06T11:30:00.000Z", text: "call the zone officer" }, "en") ?? "";
    expect(en).not.toMatch(/T\d{2}:\d{2}/);
    const ta = confirmLine({ a: "remind", at: "2026-11-06T11:30:00.000Z", text: "call the zone officer" }, "ta") ?? "";
    expect(ta).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("PB-282: the Tamil forget question is a whole sentence", () => {
  it("the one builder gives a sentence for one note and for all", () => {
    const one = confirmLine({ a: "forget" }, "ta") ?? "";
    const all = confirmLine({ a: "forget", all: true }, "ta") ?? "";
    expect(one.length).toBeGreaterThan(12);
    expect(all.length).toBeGreaterThan(12);
    expect(one).not.toBe(all);
    expect(one).toMatch(TAMIL);
  });
  it("the browser and the grader's copy of it both use that builder (no second copy to drift)", () => {
    expect(read("src/components/collector/app/thunai/Thunai.tsx")).toMatch(/confirmLine\(/);
    expect(read("tests/qa/pass4/grader/client-sim.ts")).toMatch(/confirmLine\(/);
  });
});

describe("PB-303: a day from a feed is a date, not an ISO string", () => {
  it("whenOrDay turns a whole day into '7 Nov' and keeps a moment readable", async () => {
    const { whenOrDay } = await import("@/components/collector/app/lib");
    expect(whenOrDay("2026-11-07", "2026-11-06T12:00:00+05:30")).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(whenOrDay("2026-11-07", "2026-11-06T12:00:00+05:30")).toMatch(/7 Nov/);
    expect(whenOrDay("8 hrs ago", "2026-11-06T12:00:00+05:30")).toBe("8 hrs ago");
  });
  it("class guard: no source label prints a feed's 't' without whenOrDay or fmtWhen", () => {
    for (const f of ["src/components/collector/app/AlertBar.tsx"]) expect(read(f)).not.toMatch(/s\.t\.length > 10 \? fmtWhen\(s\.t, now\) : s\.t/);
  });
});

describe("PB-299: a status is not the button of the same word", () => {
  const STATUSES = ["Open", "Under review", "Assigned", "In progress", "Awaiting verification", "Resolved", "Rejected", "Lapsed"];
  it("every status the app has is in the status table, and 'Open' there is not the order 'திற'", () => {
    for (const s of STATUSES) expect(TA_CTX.status[s], s).toBeTruthy();
    expect(TA_CTX.status.Open).not.toBe(TA.Open);
    expect(TA_CTX.status.Open).not.toMatch(/^திற$/);
  });
  it("the status list in the code and the table agree (a new status needs its Tamil)", () => {
    const m = /const STATUS = \[([^\]]+)\] as const/.exec(read("src/lib/assistant/catalog.ts"));
    const list = [...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(list.length).toBeGreaterThan(5);
    for (const s of list) expect(TA_CTX.status[s], s).toBeTruthy();
  });
  it("class guard: a complaint's status shown in a Collector or officer screen is marked data-i18n-ctx=\"status\"", () => {
    const bad: string[] = [];
    for (const f of [...walk("src/components/collector"), ...walk("src/components/officer")].filter((x) => x.endsWith(".tsx"))) {
      const s = read(f);
      for (const m of s.matchAll(/<(\w+)([^<>]*)>([^<>]*\b(?:x|i|a|r|row|it)\.status\b[^<>]*)<\/\1>/g)) {
        if (/data-i18n-ctx/.test(m[2])) continue;
        if (/=== "ok"|connector|health|\bh-/.test(m[0] + m[2])) continue; // a feed's or a connector's health, not a complaint's status
        bad.push(`${f}: ${m[0].slice(0, 90)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("PB-300: the fixed labels of the Briefing page have their Tamil", () => {
  const FILES = ["BriefingBook.tsx", "Stories.tsx", "Attention.tsx", "AlertBar.tsx"].map((f) => `src/components/collector/app/${f}`);
  const keys = new Set(Object.keys(TA).map((k) => k.toLowerCase()));
  const norm = (t: string) => t.replace(/&apos;/g, "'").replace(/\s+/g, " ").trim().replace(/\d+/g, "#");
  // the labels in the observed run (docs/qa/pass4/evidence/journeys/collector/ta-03): the fixed words only, not a title, a name or a date
  const OBSERVED = ["Critical now", "Warnings", "Oldest open complaint", "IMD warning", "First report", "Arrest", "Death", "Warning", "Action", "Update", "Watchful", "Normal", "Alert",
    "# reports · # outlets", "# report · # outlet", "· updated", "what each received · last 24 hours", "Developing stories"];
  it.each(OBSERVED)("%s", (l) => expect(keys.has(l.toLowerCase()), l).toBe(true));
  it("the story stages are a closed list: each has its Tamil", () => {
    const m = /STAGE_COL: Record<string, string> = \{([^}]+)\}/.exec(read("src/components/collector/app/Stories.tsx"));
    const names = [...(m?.[1] ?? "").matchAll(/"?([A-Z][A-Za-z ]+)"?:\s*"#/g)].map((x) => x[1]);
    expect(names.length).toBeGreaterThanOrEqual(8);
    for (const n of names) expect(keys.has(n.toLowerCase()), n).toBe(true);
  });
  it("class guard: a fixed one-text label in these components is in the dictionary", () => {
    const miss: string[] = [];
    for (const f of FILES) {
      for (const m of read(f).matchAll(/<(?:h\d|b|em|strong|label|button|small|summary)[^<>{}]*>([A-Z][A-Za-z' &·/-]{3,60})<\//g)) {
        const t = norm(m[1]);
        if (!keys.has(t.toLowerCase())) miss.push(`${path.basename(f)}: ${t}`);
      }
    }
    expect(miss).toEqual([]);
  });
  it("'11 reports · 9 outlets' is one text, so the translator sees a template and not a fragment and a stray 's'", async () => {
    const { reportsOutlets } = await import("@/components/collector/app/lib");
    expect(reportsOutlets(11, 9)).toBe("11 reports · 9 outlets");
    expect(reportsOutlets(1, 1)).toBe("1 report · 1 outlet");
    for (const [r, o] of [[11, 9], [1, 1], [3, 1], [1, 2]]) expect(TA[reportsOutlets(r, o).replace(/\d+/g, "#")], reportsOutlets(r, o)).toBeTruthy();
    for (const f of ["Stories.tsx", "BriefingBook.tsx"]) expect(read(`src/components/collector/app/${f}`)).not.toMatch(/outlet\{[^}]*\? "" : "s"\}/);
  });
});

describe("PB-207: the Tamil brief reads the briefing tool's English templates in Tamil", () => {
  it("each reason template in intel.ts has a Tamil line, and a template added there without one fails here", () => {
    const src = read("src/lib/collector/intel.ts");
    const lines = src.split("\n").filter((l) => /\badd\(\d+,\s*[`"]/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(12);
    const miss: string[] = [];
    for (const l of lines) {
      const m = /\badd\(\d+,\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*")/.exec(l);
      if (!m) continue;
      let t = m[1].slice(1, -1);
      t = /person has/.test(t) ? "5 people have died" : t.replace(/\$\{[^}]*\}/g, "5");
      if (!reasonTa(t)) miss.push(t);
    }
    expect(miss).toEqual([]);
  });
  it("a reason the pipeline's AI wrote has no Tamil line (the reading leaves it out; it is not read in English)", () => {
    expect(reasonTa("The drain overflowed after the 3 am rain")).toBeNull();
  });
  it("the Tamil of a reason carries no Latin word and keeps its number", () => {
    const t = reasonTa("Keeps happening: 7 similar incidents here in 30 days") ?? "";
    expect(t).toMatch(/7/); expect(t).toMatch(/30/); expect(t).not.toMatch(LATIN_WORDS);
    expect(reasonTa("Past its 48-hour deadline")).toMatch(/48/);
  });
  it("the conditions line in Tamil, and null when a part is not a known one", () => {
    const t = conditionsTa("Conditions: rainfall 5.1 mm in 24 h, air quality 100 AQI, reservoirs 44.1% full") ?? "";
    expect(t).toMatch(/5\.1/); expect(t).toMatch(/100/); expect(t).toMatch(/44\.1/);
    expect(t).not.toMatch(LATIN_WORDS);
    expect(conditionsTa("Conditions: snow 5 cm")).toBeNull();
  });
  it("the conditions templates in insights.ts are the ones conditionsTa knows", () => {
    const src = read("src/lib/collector/insights.ts");
    const block = /const conditions = \[([\s\S]*?)\]\.filter/.exec(src)?.[1] ?? "";
    const tpl = [...block.matchAll(/`([^`]+)`/g)].map((x) => x[1].replace(/\$\{[^}]*\}/g, "5"));
    expect(tpl.length).toBe(3);
    for (const t of tpl) expect(conditionsTa(t), t).not.toBeNull();
  });
});
