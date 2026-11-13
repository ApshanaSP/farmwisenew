/**
 * QA pass 7 (desk-and-accounts), reviewerB-04: the words the filing route sends when the complaint is not in the officer's queue yet
 * (src/lib/manu/queue.ts) are queue-note.ts's own "next update" note, before and after the merge with 029beaba (which makes that module's
 * note depend on the store).
 *   npx vitest run --config vitest.p7.config.ts tests/qa/pass7/desk-and-accounts/queue-note.test.ts
 */
import { describe, expect, it } from "vitest";
import { QUEUE_DELAY_NOTE } from "@/lib/officer/queue-note";
import { NEXT_UPDATE_NOTE } from "@/lib/manu/queue";

describe("reviewerB-04: the not-yet-in-the-queue words are queue-note.ts's own", () => {
  it("equal its note on a store that adds at the next update", () => {
    const was = process.env.DATA_BACKEND;
    delete process.env.DATA_BACKEND;
    try { expect(NEXT_UPDATE_NOTE).toEqual({ en: QUEUE_DELAY_NOTE.en, ta: QUEUE_DELAY_NOTE.ta }); } finally { if (was !== undefined) process.env.DATA_BACKEND = was; }
  });
});
