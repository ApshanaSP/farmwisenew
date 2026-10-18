import { describe, expect, it } from "vitest";
import { MAX_SLOTS, SLOT_INDEX_COOKIE, portalCookieName, rememberSlot, requestSlot } from "@/lib/session-cookies";

/** A NextResponse stand-in that records the cookies a response sets. */
function response() {
  const set = new Map<string, { value: string; maxAge?: number }>();
  return { set, cookies: { set: (name: string, value: string, o?: Record<string, unknown>) => set.set(name, { value, maxAge: o?.maxAge as number | undefined }) } };
}

describe("per-tab sessions", () => {
  it("each tab's slot has its own cookie per portal; no slot is the unslotted cookie", () => {
    expect(portalCookieName("collector", "abc12345")).toBe("dcd_session_collector__abc12345");
    expect(portalCookieName("officer", null)).toBe("dcd_session_officer");
  });

  it("a fetch names its tab in the header; a page load uses the tab cookie", () => {
    expect(requestSlot("tab00001", "tab00002")).toBe("tab00001");
    expect(requestSlot(null, "tab00002")).toBe("tab00002");
    expect(requestSlot("-", "tab00002")).toBeNull();
    expect(requestSlot(null, undefined)).toBeNull();
    expect(requestSlot(null, "bad;value")).toBeNull();
  });

  it("drops the least recently used slots beyond the limit, never the one in use", () => {
    const slots = Array.from({ length: MAX_SLOTS + 2 }, (_, i) => `slot${String(i).padStart(4, "0")}`);
    const names = slots.map((s) => portalCookieName("officer", s));
    // slot0000 is the oldest, except the tab now in use
    const index = slots.map((s, i) => `${s}.${(1000 + i).toString(36)}`).join("~");
    const res = response();
    rememberSlot(res, names, index, "slot0000");
    const dropped = Array.from(res.set.entries()).filter(([n, c]) => n !== SLOT_INDEX_COOKIE && c.maxAge === 0).map(([n]) => n);
    expect(dropped).toEqual([portalCookieName("officer", "slot0001"), portalCookieName("officer", "slot0002")]);
    expect(res.set.get(SLOT_INDEX_COOKIE)?.value).toContain("slot0000.");
    expect(res.set.get(SLOT_INDEX_COOKIE)?.value).not.toContain("slot0001");
  });
});
