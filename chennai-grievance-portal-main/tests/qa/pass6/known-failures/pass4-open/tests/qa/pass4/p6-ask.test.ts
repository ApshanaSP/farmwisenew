// QA pass 6, hunter pass4-open: pass 4's open RC-43 and RC-44 rows, re-checked on this tree through the real ask() on the pinned snapshot (no model key).
// The folder nesting (probes/pass4-open/tests/qa/pass4/) is only so vitest.qa4.config.ts's include pattern matches under --dir:
//   QA_PIN_PORT=3197 timeout 600 npx vitest run --config vitest.qa4.config.ts --dir tests/qa/pass6/probes/pass4-open p6-ask
// Each row: the pass 4 sentence (orig) and new sentences of the same kind (variant) that pass 4's fix tests never used.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// only under vitest.qa4.config.ts (dry-run store reading the pinned snapshot on 127.0.0.1); under another config this file stops before any import runs
vi.hoisted(() => { if (!(process.env.QA_GROQ_ONLY === "1" && process.env.AWS_STORE_DRY_RUN === "1" && /^http:\/\/127\.0\.0\.1:/.test(process.env.AWS_API_URL ?? ""))) throw new Error("pass4-open probe: run with vitest.qa4.config.ts only"); });
import { asOf } from "@/lib/collector/intel";
import { ask } from "@/lib/assistant/pipeline";
import { clearCaches } from "@/lib/thunai/round";

const USER = "qa.p6.pass4open@example.test";
type Card = Awaited<ReturnType<typeof ask>>["card"];
const askChat = async (message: string, period = "weekly"): Promise<Card> => (await ask({ user: USER, sessionId: null, message, inputMode: "text", language: "auto",
  scope: { period, zone: null, dept: null, cat: null, taluk: null } as never, replyTo: null, pinId: null, insightKey: null, lockDept: null, stage: () => undefined } as never)).card;
const EVID = path.resolve(process.cwd(), "..", "docs", "qa", "pass6", "evidence", "pass4-open");
const seen: Record<string, unknown> = {};
const keep = (k: string, c: Card) => { seen[k] = { kind: c.kind, headline: c.headline, scopeLine: c.scopeLine, kpis: (c.kpis ?? []).length, incidents: (c.incidents ?? []).length, md: String(c.answerMarkdown ?? "").slice(0, 600) }; };
beforeAll(async () => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T06:30:00.000Z") }); clearCaches(); await asOf(); }, 300_000);
afterAll(() => { vi.useRealTimers(); fs.mkdirSync(EVID, { recursive: true }); fs.writeFileSync(path.join(EVID, "p6-ask.json"), JSON.stringify(seen, null, 1)); });

/** The ask was refused or questioned back, with no figures about something else. */
const noUnrelatedFigures = (c: Card) => {
  expect((c.kpis ?? []).length, `${c.kind}: ${c.headline}`).toBe(0);
  expect((c.incidents ?? []).length, `${c.kind}: ${c.headline}`).toBe(0);
  expect(`${c.headline}\n${c.answerMarkdown}`, `${c.kind}: ${c.headline}`).not.toMatch(/\b\d{1,3}(,\d{3})+\b|\b\d+ (incidents|complaints|cases) (reported|open)|last 90 days|District-wide/i);
};

describe("RC-43 (PB-259, PB-260): an input that cannot be applied is named, not answered with the district or 90 days", () => {
  it.each([
    ["PB-259 orig zone", "zone 99 complaints", /99/],
    ["PB-259 orig place", "complaints in Atlantis", /Atlantis/],
    ["PB-260 orig year", "complaints from 2030", /2030/],
    ["PB-260 orig last 0", "how many complaints in Adyar in the last 0 days", /0 days/],
    // variants: the same bug class, sentences a Collector could type
    ["variant place lower case", "how many complaints in atlantis", /atlantis/i],
    ["variant place with City", "open complaints in Gotham City", /Gotham/],
    ["variant place one word", "garbage complaints in Springfield this week", /Springfield/],
    ["variant zone words", "complaints in zone twenty", /twenty|20/i],
    ["variant ward", "how many complaints in ward 450", /450/],
    ["variant future month", "complaints in December 2026", /December|2026/],
    ["variant zero words", "complaints in the last zero days", /zero/i],
    ["variant beyond held", "how many complaints in the last 500 days", /500/],
    ["variant future date", "incidents on 25 December", /25 December|December/]
  ])("%s: %s", async (name, text, named) => {
    const c = await askChat(text as string);
    keep(`RC-43 ${name}`, c);
    // the line names what it could not apply, and no figure block is given for the district or the last 90 days instead
    expect(`${c.headline}\n${c.answerMarkdown}`, `${c.kind}: ${c.headline} | ${c.scopeLine}`).toMatch(named as RegExp);
    noUnrelatedFigures(c);
  });
});

describe("RC-44 (PB-261, PB-262, PB-305, PB-306, PB-307, PB-330): a question the rules cannot answer is not answered with unrelated figures", () => {
  it.each([
    ["PB-305 orig save", "Save this workspace as Collector's Daily Briefing and reopen last week's version"],
    ["PB-306 orig sources", "Show every source and application record used to create this briefing"],
    ["PB-330 orig forecast", "predict next week's complaints"],
    ["PB-330 orig letter", "draft a letter to the commissioner about the floods"],
    // variants
    ["variant save dashboard", "save this dashboard as my Monday view"],
    ["variant pin layout", "keep this layout for tomorrow's meeting"],
    ["variant sources plain", "which datasets did you use to make this answer?"],
    ["variant forecast backlog", "what will the backlog look like at the end of the month"],
    ["variant forecast trend", "how many incidents should we expect in Adyar next week"],
    ["variant reply", "draft a reply to the citizen who complained about garbage in Adyar"],
    ["variant note", "prepare a note for the Chief Secretary on flooding"],
    ["variant send", "send these figures to the zonal officers by email"]
  ])("%s: %s", async (name, text) => {
    const c = await askChat(text as string);
    keep(`RC-44 ${name}`, c);
    noUnrelatedFigures(c);
  });

  it("PB-307 orig: a ranking of taluks lists the taluks", async () => {
    const c = await askChat("List the taluks with the highest number of unresolved incidents last month");
    keep("RC-44 PB-307 orig taluks", c);
    expect((c.answerMarkdown.match(/\(\d[\d,]*\)|\|\s*\d[\d,]*\s*\|/g) ?? []).length, c.answerMarkdown).toBeGreaterThanOrEqual(3);
  });
  it("PB-307 variant: which taluk has the most pending incidents", async () => {
    const c = await askChat("which taluk has the most pending incidents this month?");
    keep("RC-44 PB-307 variant taluk", c);
    expect(`${c.headline}\n${c.answerMarkdown}`, `${c.headline} | ${c.scopeLine}`).toMatch(/Tondiarpet|Mambalam|Mylapore|Egmore|Guindy|Perambur|Madhavaram|Ambattur|Thiruvottiyur|Alandur|Sholinganallur|Velachery/);
    expect((c.incidents ?? []).length, "an incident list is not a taluk ranking").toBe(0);
  });

  // (QA pass 7: a count of one level, "5,352 medium-severity incidents", names the level asked and no other leads; the break was "Low leads" over a severe question)
  it.each([["PB-261 orig", "how many severe", /^Severe/i], ["PB-261 variant critical", "how many critical incidents this week", /critical|severe/i], ["PB-261 variant medium", "how many medium severity incidents", /^(?:Medium|[\d,]+ medium-severity)/i]])
  ("%s: a severity question leads with the severity asked: %s", async (name, text, lead) => {
    const c = await askChat(text as string);
    keep(`RC-44 ${name}`, c);
    expect(c.headline).not.toMatch(/^Low leads/i);
    expect(c.headline).toMatch(lead as RegExp);
  });

  it.each([
    ["PB-262 orig", "percentage of resolved complaints", /% .*resolved|resolved.*%/i],
    ["PB-262 variant on time", "what percentage of complaints were resolved within the deadline", /on time|within (the )?deadline|before (the )?deadline/i],
    ["PB-262 variant ratio", "ratio of open to closed incidents this week", /ratio|open.*closed|:/i]
  ])("%s: a share question gets the share it asked: %s", async (name, text, says) => {
    const c = await askChat(text as string);
    keep(`RC-44 ${name}`, c);
    expect(c.incidents ?? [], c.headline).toEqual([]);
    expect(`${c.headline}`, c.answerMarkdown).toMatch(says as RegExp);
  });
});
