/**
 * 27 Nov review: a Studio link to agmarknet.gov.in or agrimark.tn.gov.in is read from the TN Agricultural Marketing department's feed. With
 * no recent prices kept, a site that answers none of the first three calls (the hosted copy abroad, which it refuses) is not asked the other
 * 13 at 20 s each, and the error says it did not answer. No network: the feed and the host check are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ fetch: vi.fn(), held: null as unknown }));
vi.mock("@/lib/collector/tnprices", async (orig) => ({ ...(await orig<typeof import("@/lib/collector/tnprices")>()), fetchMarketDay: h.fetch, fileDay: () => h.held }));
vi.mock("@/lib/studio/fetchurl", async (orig) => ({ ...(await orig<typeof import("@/lib/studio/fetchurl")>()), checkHost: async () => undefined }));

import { adapterFor } from "./adapters";

beforeEach(() => { h.fetch.mockReset(); h.held = null; });

describe("a price link read from agrimark.tn.gov.in", () => {
  it("stops after three calls the site does not answer, and says so", async () => {
    h.fetch.mockRejectedValue(new Error("fetch failed"));
    const read = adapterFor("https://agmarknet.gov.in/home")!;
    await expect(read(() => undefined)).rejects.toMatchObject({ code: "network", message: expect.stringMatching(/did not answer/) });
    expect(h.fetch).toHaveBeenCalledTimes(3);
  });

  it("reads the markets when the site answers", async () => {
    h.fetch.mockResolvedValue([["Tomato", "", 4000, 5000, 4500, 1.06, "Vegetables"]]);
    const read = adapterFor("https://agrimark.tn.gov.in/")!;
    const a = await read(() => undefined);
    expect(h.fetch).toHaveBeenCalledTimes(8);
    expect(a.table.rows).toHaveLength(8);
    expect(a.table.rows[0]).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "Nanganallur", "Chengalpattu", "Tomato", null, "Vegetables", 40, 50, 45, 1060]);
  }, 15_000);
});
