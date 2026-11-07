// RC-38 class guard (PB-199): a news headline that carries a private person's phone number or email is hidden on EVERY console path that prints a
// headline, not only the search box: the search box, the news stories, one story's reports, an incident's reports and the overview's news line.
// Real code on the pinned snapshot, no model. Counts and ids only: the text of a record is never printed.
//   npx vitest run --config vitest.qa4.config.ts tests/qa/pass4/rc38-news-privacy.test.ts
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import "@/lib/collector/derive";
import { awsPool } from "@/lib/aws/store";
import { asOf, incident, newsArticles, newsStories, overview, search } from "@/lib/collector/intel";

const FROZEN = "2026-11-06T06:30:00.000Z";
const PHONE = /(?<![\w.\/-])(?:(?:\+?91|0)[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\w-])/, EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const leaks = (s: unknown) => PHONE.test(String(s ?? "")) || EMAIL.test(String(s ?? ""));
let leaky: { id: string; inc: string | null }[] = [];
let now = "";

describe("RC-38: no console path prints a private phone number or email from a news headline", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(FROZEN) });
    now = await asOf();
    const [rows] = await awsPool().query(`SELECT doc_id AS id, linked_incident_id AS inc, title, title_en FROM documents WHERE title IS NOT NULL`);
    leaky = (rows as any[]).filter((r) => leaks(r.title) || leaks(r.title_en)).map((r) => ({ id: String(r.id), inc: r.inc ? String(r.inc) : null }));
  });
  afterAll(() => { vi.useRealTimers(); });

  it("the snapshot has such headlines, so the checks below are not empty", () => {
    expect(leaky.length).toBeGreaterThan(0);
  });
  it("one story's reports (the news preview) hide them", async () => {
    const arts = await newsArticles(leaky.map((l) => l.id));
    expect(arts.length).toBeGreaterThan(0);
    expect(arts.filter((a: any) => leaks(a.title) || leaks(a.title_en) || leaks(a.summary)).length).toBe(0);
  });
  it("the news stories and their original headlines hide them", async () => {
    const stories: any[] = await newsStories("quarterly", now);
    expect(stories.length).toBeGreaterThan(0);
    expect(stories.filter((s) => leaks(s.title) || leaks(s.original)).length).toBe(0);
  });
  it("an incident's reports hide them (where this snapshot links such an article to a live incident), and the code never copies a title unredacted", async () => {
    const [rows] = await awsPool().query(`SELECT d.linked_incident_id AS inc, d.title, d.title_en FROM documents d JOIN incidents i ON i.incident_id = d.linked_incident_id`);
    const ids = [...new Set((rows as any[]).filter((r) => leaks(r.title) || leaks(r.title_en)).map((r) => String(r.inc)))].slice(0, 25);
    for (const id of ids) {
      const d: any = await incident(id);
      expect((d?.reports ?? []).filter((r: any) => leaks(r.title) || leaks(r.title_en)).length, id).toBe(0);
    }
    // the same rule for a snapshot that has some: no report title in intel.ts is taken straight from a document row
    const src = fs.readFileSync(path.join(__dirname, "../../../src/lib/collector/intel.ts"), "utf8");
    expect(src.match(/title: (d\??\.title|m\.title|x\.title)\b[^)]/g) ?? []).toEqual([]);
  });
  it("the overview's news headlines hide them", async () => {
    const o: any = await overview("quarterly", null);
    expect((o.news ?? []).filter((n: any) => leaks(n.news_title)).length).toBe(0);
  });
  it("the search box hides them for a word of each of the first headlines", async () => {
    const [rows] = await awsPool().query(`SELECT title FROM documents WHERE title IS NOT NULL`);
    const words = (rows as any[]).filter((r) => leaks(r.title)).slice(0, 8).map((r) => String(r.title).split(/\s+/).find((w) => w.length > 5 && !leaks(w)) ?? "");
    let n = 0;
    for (const w of words.filter(Boolean)) { const r = await search(w); n += r.news.filter((x: any) => leaks(x.title)).length; }
    expect(n).toBe(0);
  });
});
