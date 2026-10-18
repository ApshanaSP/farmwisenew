import { afterEach, describe, expect, it, vi } from "vitest";
import { TAB_SESSION_SCRIPT } from "@/lib/tab-session";

/** Runs the tab script in a stand-in browser whose network answers the slot move only when `release()` is called. */
function browser(opts: { cookie?: string; slot?: string }) {
  const sent: { url: string; tab: string | null }[] = [];
  let release = () => {};
  const moved = new Promise<void>((r) => (release = r));
  const store = new Map<string, string>(opts.slot ? [["dcd_tab", opts.slot]] : []);
  const doc = { cookie: opts.cookie ?? "", hidden: false };
  const win: Record<string, unknown> = {
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    addEventListener: () => {},
    fetch: async (input: string, init?: RequestInit) => {
      sent.push({ url: input, tab: new Headers(init?.headers).get("x-dcd-tab") });
      if (input === "/api/auth/tab") await moved;
      return { ok: true, status: 200 };
    }
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("location", { href: "http://localhost:3000/login", origin: "http://localhost:3000" });
  new Function(TAB_SESSION_SCRIPT)();
  return { sent, release, store, fetch: win.fetch as (u: string, i?: RequestInit) => Promise<unknown> };
}

afterEach(() => vi.unstubAllGlobals());

describe("tab-session script", () => {
  it("a new tab's sign-in waits for its own slot, so it never lands in the tab it came from", async () => {
    const b = browser({ cookie: "dcd_tab=othertab01" });
    const login = b.fetch("/api/auth/login", { method: "POST" });
    await new Promise((r) => setTimeout(r, 10));
    expect(b.sent.map((s) => s.url)).toEqual(["/api/auth/tab"]); // the login is held back
    b.release();
    await login;
    const slot = b.store.get("dcd_tab");
    expect(slot).toMatch(/^[a-z0-9]{6,24}$/);
    expect(slot).not.toBe("othertab01");
    expect(b.sent[1]).toEqual({ url: "/api/auth/login", tab: slot });
  });

  it("a tab that already has its slot sends at once, with that slot", async () => {
    const b = browser({ slot: "mytab00001", cookie: "dcd_tab=othertab01" });
    await b.fetch("/api/auth/me");
    expect(b.sent).toEqual([{ url: "/api/auth/me", tab: "mytab00001" }]);
  });
});
