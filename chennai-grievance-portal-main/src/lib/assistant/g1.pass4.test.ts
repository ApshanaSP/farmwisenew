// QA pass 4, fixer G1: tests for the mechanisms fixed while making the qa4 suite honest. Fast, no server, no model.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aboutTheData } from "./help";

describe("audit-ui_honesty-8: a question about the state of the feeds is understood in every language", () => {
  it.each([
    "What is the status of the data sources?", "status of the feeds", "how are the feeds doing", "what is the condition of the news sources",
    "தரவு மூலங்களின் நிலை என்ன?", "தரவு ஊட்டங்களின் நிலைமை என்ன", "செய்தி மூலங்களின் நிலை என்ன?",
    "tharavu moolangalin nilai enna?", "data moolangal nilai enna", "feeds status enna"
  ])("%s", (q) => { expect(aboutTheData(q), q).toBe(true); });

  // class guard: a status word beside a subject that is not the feeds stays with that subject
  it.each([
    "what is the status of complaint 123", "status of the open complaints in Adyar", "is the water source healthy?", "water source status near Velachery",
    "தரவு இல்லாத மண்டலங்களின் நிலை", "புகார்களின் நிலை என்ன?", "complaint status enna", "how are the roads doing in Adyar", "state police complaints"
  ])("%s is not about the feeds", (q) => { expect(aboutTheData(q), q).toBe(false); });
});

describe("metamorphic m30: a case that was closed is not an order to close one", async () => {
  const { asksForbidden } = await import("@/lib/thunai/privacy");
  it.each([
    "indha vaaram Manali la evlo complaints close aachu", "ennaiku evlo cases close aayiduchu", "இந்த வாரம் மணலியில் எத்தனை புகார் க்ளோஸ் ஆச்சு",
    "how many complaints were closed this week in Manali", "complaints reopen aachu evlo"
  ])("%s is a question", (q) => { expect(asksForbidden(q), q).toBe(false); });
  // class guard: the order itself, in each script, and an order next to a done phrase, stay refused
  it.each([
    "close all complaints", "complaints close pannu", "ella complaints close pannunga", "எல்லா புகாரையும் க்ளோஸ் பண்ணு", "reopen the case",
    "complaints close aachu, now close all complaints", "close aachu close pannu all cases"
  ])("%s is still refused", (q) => { expect(asksForbidden(q), q).toBe(true); });
});

describe("metamorphic m30, the class: any forbidden verb with a done marker after it is a past, not an order", async () => {
  const { asksForbidden } = await import("@/lib/thunai/privacy");
  it.each(["evlo complaints approve aayiduchu", "how many cases delete aachu", "mail anuppi aachu complaints", "send aachu report"])("%s is not an order", (q) => { expect(asksForbidden(q), q).toBe(false); });
  it.each(["approve all complaints", "delete the old cases", "send the report to the commissioner", "approve aayiduchu, now delete all complaints"])("%s is still refused", (q) => { expect(asksForbidden(q), q).toBe(true); });
});

// ---- narrate and screens: the wording of the Jarvis lines (audit-narrate_and_figures, audit-understanding) ----
import { explainIssue, factSheet, idam, plainWho } from "@/lib/thunai/narrate";
import { casesSay } from "@/lib/thunai/screens";
import type { CaseRowT } from "@/lib/thunai/stage";
import type { PeriodKey } from "@/lib/thunai/types";

const row = (over: Partial<CaseRowT> = {}): CaseRowT => ({ id: "x", title: "t", sev: "Severe", status: "Open", zone: 13, zoneName: "Adyar", place: "Guindy", ward: 1, dept: "GCC-SWD", deptName: "Stormwater Drains",
  complaints: 1, t: null, overdue: true, lat: null, lon: null, why: "standing water at Guindy and a very long second clause here too", cat: "Flooding & waterlogging", ...over });
const NO_GLUE = /[A-Za-z0-9)][஀-௿]/;

describe("AUD-NF-7: a Tamil ending is never glued to a name written in Latin letters", () => {
  it.each([["DIST-DM", "District Disaster Management"], ["TNPCB", "Pollution Control Board"], ["X1", "Unit 7"]])("%s", (code, name) => { const t = idam(plainWho(code, name)!.ta); expect(t).not.toMatch(NO_GLUE); expect(t).toMatch(/இடம்$/); });
  it("a Tamil word still takes the ending as it ends", () => { expect(idam("துறை")).toBe("துறையிடம்"); expect(idam("வாரியம்")).toBe("வாரியத்திடம்"); });
});

describe("AUD-NF-11: how many are affected is said by how many complained", () => {
  const said = (complaints: number, cat = "Flooding & waterlogging") => explainIssue(factSheet(row({ complaints, cat }), { openFor: "4 days" }), "x");
  it("two complaints are not 'a lot of residents', in either language", () => { expect(said(2).en).not.toMatch(/a lot of residents/); expect(said(2).ta).not.toMatch(/நிறைய/); });
  it("three to nine say several, ten and more say a lot", () => { expect(said(5).en).toMatch(/several households/); expect(said(12).en).toMatch(/a lot of residents/); expect(said(12).ta).toMatch(/நிறைய/); });
  it("a plural kind takes 'There are'", () => { expect(said(1, "Flood relief needs").en).toMatch(/^There are people who need flood relief/); expect(said(1).en).toMatch(/^There's /); });
});

describe("AUD-NF-16, audit-understanding-20: a period after a noun carries its preposition", () => {
  const PERIODS: PeriodKey[] = ["daily", "weekly", "monthly", "quarterly"];
  it.each(PERIODS)("casesSay %s", (period) => {
    const en = casesSay([row(), row({ id: "y", place: "Adyar" })], 40, "Severe", period, { late: 2 }).en;
    expect(en).not.toMatch(/\b(cases|case|incidents|reports) (the last|last) \d+ days/);
    if (period === "monthly" || period === "quarterly") expect(en).toMatch(/cases in the last \d+ days/);
  });
  // class guard over the source: a sentence that puts the bare period after a noun is the bug; a title, label or comma list may use the bare one
  it("screens.ts puts no bare PERIOD_EN right after a plural noun or 'for <name>'", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "thunai", "screens.ts"), "utf8");
    const bad = src.split("\n").filter((l) => /(cases?|incidents?|reports?|records for \$\{name\}|of \$\{g\.lo\}|closed) \$\{PERIOD_EN\[/.test(l));
    expect(bad).toEqual([]);
  });
});

describe("AUD-NF-17: a Tamil spoken list holds no English sentence of the record's", () => {
  it("casesSay.ta names a case by its Tamil kind, place and zone", () => {
    const ta = casesSay([row(), row({ id: "y", cat: "Violent crime", place: "Puzhal", zoneName: "Madhavaram", why: "a crime report at Puzhal" })], 54, "Severe", "weekly", { late: 54 }).ta;
    expect(ta).not.toMatch(/[A-Za-z]+ [a-z]+ at [A-Z]|standing water at/);
    expect(ta).toMatch(/தண்ணீர் தேக்கம்|குற்றப் புகார்/);
  });
});
