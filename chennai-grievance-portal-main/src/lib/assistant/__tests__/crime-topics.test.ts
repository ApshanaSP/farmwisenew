import { describe, expect, it } from "vitest";
import { detectIntent } from "@/lib/assistant/intent";
import { customWindow, periodNamed } from "@/lib/assistant/fastpath";
import { sidesOf } from "@/lib/assistant/compare";

describe("named kinds of case", () => {
  it("reads rape and murder as narrow topics, searched by meaning", () => {
    expect(detectIntent("tell me rape cases occured in this month in anna nagar", null).topic?.key).toBe("rape");
    expect(detectIntent("any sexual assault reported", null).topic?.narrow).toBeTruthy();
    expect(detectIntent("any murder case in past 24 hrs check in news and department data?", null).topic?.key).toBe("murder");
    expect(detectIntent("dowry harassment complaints", null).topic?.key).toBe("women");
  });
  it("reads 24 hrs, today's and yesterday as periods", () => {
    expect(periodNamed("any murder case in past 24 hrs")).toBe("daily");
    expect(periodNamed("last 24 hours")).toBe("daily");
    expect(periodNamed("summarise todays news")).toBe("daily");
    expect(customWindow("what happened in royapuram yesterday")).toMatchObject({ hours: 24, offset: 1 });
    expect(customWindow("last 10 days")).toMatchObject({ hours: 240 });
  });
  it("splits a comparison into its places", () => {
    expect(sidesOf("compare velachery and tambaram for flooding")).toEqual(["velachery", "tambaram"]);
    expect(sidesOf("Royapuram vs Tondiarpet this month")).toEqual(["Royapuram", "Tondiarpet"]);
    expect(sidesOf("how many floods in adyar")).toBeNull();
  });
});
