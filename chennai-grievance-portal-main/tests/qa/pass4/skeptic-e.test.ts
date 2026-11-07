// Skeptic, lane e (RC-10 window words, RC-11 department route, RC-45 dataset guard). Pure functions on the real code; each break is it.fails.
// The real-run log for the Tamil forms is in docs/qa/pass4/reviews/e-skeptic.md (port 3204, build older than the RC-10 fix, so only unfixed forms are claimed from it).
import { describe, expect, it } from "vitest";
import { datasetWriteAllowed } from "@/lib/dataset/target";
import { directTool } from "@/lib/assistant/direct";
import { customWindow } from "@/lib/assistant/fastpath";
import { YESTERDAY } from "@/lib/assistant/when";

const NOW = "2026-11-06 12:00:00";
const lastWeekLabel = (q: string) => customWindow(q, NOW)?.label ?? "";

describe("skeptic e", () => {
  it("control: English last week is the calendar week", () => expect(lastWeekLabel("complaints last week")).toMatch(/^last week \(26 Oct to 1 Nov\)/));
  it.fails("SK-E-1 Tamil கடந்த வாரம் / போன வாரம் is the same calendar week as English last week (now a rolling 7 days: 787 vs a Monday to Sunday count)", () => {
    expect(lastWeekLabel("கடந்த வாரம் எத்தனை புகார்கள்")).toMatch(/^last week/);
    expect(lastWeekLabel("போன வாரம் புகார்")).toMatch(/^last week/);
  });
  it.fails("SK-E-2 Tamil கடந்த மாதம் is the calendar month, like English last month", () => expect(lastWeekLabel("கடந்த மாதம் எத்தனை புகார்கள்")).toMatch(/^last month/));
  it.fails("SK-E-3 Tanglish pona vaaram / pona maasam is the calendar week / month (the regex lists pona and kadandha but only the English nouns week and month)", () => {
    expect(lastWeekLabel("pona vaaram evvalavu complaints")).toMatch(/^last week/);
    expect(lastWeekLabel("pona maasam evvalavu complaints")).toMatch(/^last month/);
  });
  it.fails("SK-E-4 'the last week of October' is a week inside October, not last week (26 Oct to 1 Nov)", () => {
    for (const q of ["how many complaints in the last week of October", "last week of October complaints"]) expect(lastWeekLabel(q), q).not.toMatch(/^last week \(|^October 2026|^last month/);
  });
  it.fails("SK-E-5 yesterday: Tamil நேற்றைக்கு, and Tanglish nethiku / netraikku (the Jarvis and gloss lists already know nethiku) are yesterday", () => {
    for (const w of ["நேற்றைக்கு எத்தனை புகார்கள்", "nethiku complaints evvalavu", "netraikku complaints evvalavu"]) expect(YESTERDAY.test(w), w).toBe(true);
  });
  it.fails("SK-E-6 Tamil department wise past deadline: plural and colloquial forms go to the department follow-ups, like the written forms", () => {
    for (const q of ["துறைகள் வாரியாக காலக்கெடு தாண்டியவை", "துறை வாரியா தாமதம்"]) expect(directTool(q)?.name, q).toBe("dept_followups");
  });
  it.fails("SK-E-7 a dry-run server never writes the tracked data/datasets folder, even when DATASET_DIR names it", () => {
    expect(datasetWriteAllowed({ DATASET_DIR: "data/datasets", AWS_STORE_DRY_RUN: "1" } as NodeJS.ProcessEnv)).toBe(false);
  });
});
