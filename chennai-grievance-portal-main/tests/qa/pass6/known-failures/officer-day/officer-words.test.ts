// QA pass 6, officer-day: the officer console's own stage and action words: hand-checked Tamil or cached, without a model?
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { translate } from "@/components/i18n/Translator";

it("officer console words have Tamil without a model", () => {
  const cache = (() => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "i18n", "ta.json"), "utf8")) as Record<string, string>; } catch { return {}; } })();
  const words = ["New", "In action", "Sent to Collector", "Verified", "Closed", "Returned", "Approve", "Received", "Waiting for your approval",
    "Collector Feedback", "Verified by Collector", "Closed by your department", "Approving moves it to In action and assigns it to the field officer.",
    "Severe: the Collector verifies it. Remarks and photos go to the Collector.", "You verify this one: your remarks and photos are kept as the record.",
    "Photos of completed work", "Attach at least one photo of the completed work.", "Write remarks describing the work done."];
  const res = words.map((w) => ({ w, ta: translate(w) ?? cache[w] ?? null }));
  console.log(JSON.stringify(res));
  expect(res.filter((r) => r.ta == null).map((r) => r.w)).toEqual([]);
});
