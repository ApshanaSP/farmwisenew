import { afterEach, describe, expect, it } from "vitest";
import { QUEUE_DELAY_NOTE } from "./queue-note";

// P5-033 part seam-05: the citizen was told the officer would see the complaint "at the next update, which runs every hour", although on
// the AWS store the filing route puts it in the officer's queue at once (addCaseLive). The filing route sends QUEUE_DELAY_NOTE as it is
// (src/app/api/complaints/route.ts, a p7 file), so the note itself now says what is true for the store in use.
const was = process.env.DATA_BACKEND;
afterEach(() => { if (was === undefined) delete process.env.DATA_BACKEND; else process.env.DATA_BACKEND = was; });
const sent = () => JSON.parse(JSON.stringify({ queueNote: QUEUE_DELAY_NOTE })).queueNote as { en: string; ta: string };

describe("seam-05: the citizen's queue note says when the officer will see the complaint, for the store in use", () => {
  it("on the AWS store (added at once): already in the queue, in English and Tamil, never 'next update'", () => {
    process.env.DATA_BACKEND = "aws";
    const n = sent();
    expect(n.en).toMatch(/already in the department officer's queue/);
    expect(n.en).not.toMatch(/next update/i);
    expect(n.ta).toMatch(/ஏற்கனவே/);
    expect(n.ta).not.toMatch(/புதுப்பிப்பில்/);
  });

  it("on the pipeline's store (added at the next build): the next update, as before", () => {
    delete process.env.DATA_BACKEND;
    expect(sent().en).toMatch(/next update/i);
    process.env.DATA_BACKEND = "mysql";
    expect(sent().ta).toMatch(/புதுப்பிப்பில்/);
  });
});
