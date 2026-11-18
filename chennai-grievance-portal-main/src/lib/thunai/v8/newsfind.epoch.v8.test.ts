/**
 * The QA gate (19 Nov, pass 4's g2-cache class guard, RC-35): v8's week of stored stories (newsfind.ts storeStories, kept a minute) did not
 * follow the data epoch. A decision or a store write must empty it like every other timed cache over the store.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn(async () => [[{ id: "d1", title: "Pallikaranai marsh construction ban", title_en: null, publisher: "The Hindu", publisher_domain: "thehindu.com", publisher_tier: "national", place: null, story: null, t: "2026-11-18 21:00" }]]) }));
vi.mock("@/lib/collector/db", () => ({ default: { query } }));
vi.mock("@/lib/collector/intel", () => ({ asOf: async () => "2026-11-19 01:00:00" }));

import { bumpDataEpoch } from "@/lib/collector/epoch";
import { storeStories } from "./newsfind";

describe("v8's stored-stories cache follows the data epoch (RC-35)", () => {
  beforeEach(() => query.mockClear());
  it("a second request inside the minute reads the store once", async () => {
    bumpDataEpoch();
    await storeStories();
    await storeStories();
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("after a decision (the epoch moved) the next request reads the store again", async () => {
    await storeStories();
    query.mockClear();
    bumpDataEpoch();
    await storeStories();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
