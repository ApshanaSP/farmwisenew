/**
 * The dataset brief (U8): the data card, the top three, and a "Needs action" table of only the insights that need
 * action; Tamil labels in the Tamil brief, with the Tamil font embedded; text from the data is escaped.
 */
import { describe, expect, it } from "vitest";
import { briefHtml } from "@/lib/studio/briefpdf";
import type { DataCard } from "@/lib/studio/datacard";
import type { Brief, BriefItem, DatasetMeta } from "@/lib/studio/types";

const item = (title: string, priority: BriefItem["priority"], extra: Partial<BriefItem> = {}): BriefItem => ({
  id: title, label: "Backlog", tone: "sev", score: 70, text: `${title}: 42 open.`, title, metric: { value: "42", caption: "" }, bars: [], series: [], plan: null, key: null, owner: "GCC Storm Water Drain",
  headline: title, why: "Every open item is a citizen waiting.", action: "Ask for a dated plan.", priority, by: "rules", confidence: "n = 412 · counted · 1 Oct – 27 Oct 2026", ...extra
});
const brief: Brief = { verdict: "Desilting behind in three zones", summary: [], questions: [], considered: 9, by: "rules", model: null, dropped: 0, at: "2026-10-28T00:00:00Z",
  items: [item("Adyar lags", "act"), item("Rain season peak", "watch"), item("Steady share of drains", "note"), item("Teynampet backlog", "act", { headline: "Teynampet <script>alert(1)</script> backlog" })] };
const card = {
  source: { kind: "link", name: "x.csv", url: "https://x", fetchedAt: null, how: "Downloaded from data.example", terms: "Published by data.example." },
  rows: { read: 420, removed: [], used: 412 }, fixes: [], places: { share: 90, unmatched: [] }, dates: { from: "2026-10-01", to: "2026-10-27", ageDays: 1 },
  family: { name: "Works register", confidence: 0.9, by: "rules" }, reading: { by: "rules", model: null, steps: [] }, checks: [{ label: "Chennai's data", ok: true, detail: "" }], connector: null, changes: []
} as DataCard;
const meta = { name: "SWD desilting", id: "ds_x" } as DatasetMeta;

describe("the dataset brief", () => {
  it("holds the data card, the top three, and only the Needs action items in its table", () => {
    const h = briefHtml(meta, brief, card, "en");
    expect(h).toContain("420 read → 8 left out → <b>412</b> used");
    expect(h).toContain("Works register");
    const table = h.slice(h.indexOf("<table>"), h.indexOf("</table>"));
    expect(table).toContain("Adyar lags");
    expect(table).toContain("Teynampet");
    expect(table).not.toContain("Rain season peak");
    expect(table).not.toContain("Steady share");
    expect(h).toContain("n = 412");
    expect(h).toMatch(/nothing was sent/);
  });
  it("escapes text from the data (no script runs)", () => {
    const h = briefHtml(meta, brief, card, "en");
    expect(h).not.toContain("<script>alert(1)</script>");
    expect(h).toContain("&lt;script&gt;");
  });
  it("is in Tamil, with the Tamil font embedded", () => {
    const h = briefHtml(meta, brief, card, "ta");
    expect(h).toContain('lang="ta"');
    expect(h).toContain("நடவடிக்கை தேவை");
    expect(h).toContain("தரவுச் சுருக்கம்");
    expect(h).toMatch(/@font-face\{font-family:"Noto Sans Tamil";src:url\(data:font\/woff2;base64,/);
  });
  it("says so when nothing needs action", () => {
    const h = briefHtml(meta, { ...brief, items: [item("A", "watch")] }, card, "en");
    expect(h).toContain("Nothing needs action now.");
  });
});
