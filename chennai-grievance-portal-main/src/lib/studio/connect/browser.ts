/**
 * A real browser, driven by the server (Playwright), for links a plain download cannot read:
 *
 *   - pages that build their data with JavaScript (dashboards, data portals): the page runs as in a browser, and the
 *     JSON it loads for itself is kept, which is cleaner than the drawn screen
 *   - sign-in pages: the user name and password are typed into the site's own form, and the session is kept so the
 *     next refresh does not sign in again; an expired session signs in again by itself
 *   - sign-ins a program must not do (OTP, CAPTCHA, single sign-on): a visible window opens on this PC and the
 *     Collector signs in once; the session is kept
 *
 * It drives the Edge or Chrome already on the computer (no download needed), else Playwright's own Chromium. The browser
 * is started behind the Studio's egress proxy (connect/egress.ts) with no bypass, so every connection a page makes
 * (navigations and the redirects Chromium follows itself, POSTs, fetches, WebSockets, workers, iframes) passes the same
 * address policy as a plain download, at the moment it connects; a browser that turns out not to use the proxy is closed
 * before it reads anything. Images, fonts and media are not loaded. It never solves a CAPTCHA, never fills an OTP and
 * never hides that it is automated.
 */
import type { Browser, BrowserContext, Page } from "playwright-core";
import { checkHost, LinkError, MAX_BYTES } from "@/lib/studio/fetchurl";
import { egress, REFUSED_HEADER } from "@/lib/studio/connect/egress";

export interface Captured { url: string; text: string; status: number }
export interface Visit { html: string; url: string; title: string; json: Captured[]; session: string | null; signedIn: "none" | "reused" | "fresh" | "manual" }

export interface VisitOpts {
  /** a kept session (Playwright storage state, JSON) */
  session?: string | null;
  login?: { username: string; password: string; loginUrl?: string } | null;
  manual?: { loginUrl?: string } | null;
  log?: (text: string) => void;
}

declare global {
  // eslint-disable-next-line no-var
  var __studioBrowser: { browser: Browser; at: number; timer: ReturnType<typeof setInterval> | null } | undefined;
}

async function engine() {
  try { return (await import("playwright-core")).chromium; } catch {
    throw new LinkError("The browser engine is not installed on this server (npm install playwright-core).", "browser");
  }
}

/**
 * What the browser is started with, besides the proxy. Each closes a way out that does not pass a proxy:
 *   - WebRTC sends UDP (STUN) and TCP (TURN) to any address it is given: only through the proxy, or not at all
 *   - QUIC (HTTP/3, WebTransport) is UDP and cannot be proxied: off
 *   - no name is looked up by the browser itself (the proxy resolves every one): a DNS prefetch reaches nothing, and anything that
 *     tried to connect round the proxy by name could not find it
 */
const FENCE_ARGS = [
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--disable-quic",
  "--dns-prefetch-disable",
  "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"
];

/** Edge, then Chrome, then Playwright's own Chromium: whichever this computer has. Always behind the egress proxy. */
async function launch(headless: boolean): Promise<Browser> {
  const chromium = await engine();
  const proxy = await egress();
  const tries: { channel?: string; executablePath?: string }[] = [];
  if (process.env.STUDIO_BROWSER_PATH) tries.push({ executablePath: process.env.STUDIO_BROWSER_PATH });
  tries.push({ channel: "msedge" }, { channel: "chrome" }, {});
  let last: unknown;
  for (const t of tries) {
    let browser: Browser;
    // "<-loopback>": Chromium sends this machine's own addresses (localhost, 127.0.0.1, [::1], link-local) round a proxy unless told not to
    try { browser = await chromium.launch({ headless, ...t, proxy: { server: proxy.server, bypass: "<-loopback>" }, args: ["--disable-dev-shm-usage", ...FENCE_ARGS] }); } catch (e) { last = e; continue; }
    try { await fenced(browser); return browser; } catch (e) { last = e; }
  }
  if (last instanceof LinkError) throw last;
  console.warn("[studio] no browser could be started:", (last as Error)?.message?.slice(0, 200));
  throw new LinkError("No browser could be started on this server. Install Microsoft Edge or Google Chrome, or run: npx playwright install chromium", "browser");
}

/**
 * The browser proves it sends everything through the proxy, this machine's own address included, before it opens any page: a
 * one-time address on the proxy's own port must arrive AS A PROXY REQUEST. A browser that went round the proxy (a machine policy that
 * overrides the proxy setting, a browser that ignores it) is closed and nothing is read.
 */
async function fenced(browser: Browser): Promise<void> {
  const proxy = await egress();
  const probe = proxy.probe();
  const ctx = await browser.newContext({ serviceWorkers: "block" }).catch(() => null);
  try {
    if (ctx) {
      const page = await ctx.newPage();
      await page.goto(probe.url, { timeout: 15_000 }).catch(() => null);
    }
  } finally {
    await ctx?.close().catch(() => {});
  }
  if (probe.seen() === "proxied") return;
  await browser.close().catch(() => {});
  console.error(`[studio] the browser did not go through the egress proxy (${probe.seen() ?? "nothing arrived"}); it was closed`);
  throw new LinkError("The Studio's browser could not be fenced to public sites on this server, so it was not used. Download the file and drop it here instead.", "browser");
}

/** One shared hidden browser, closed after five idle minutes. */
async function shared(): Promise<Browser> {
  const g = global.__studioBrowser;
  if (g && g.browser.isConnected()) { g.at = Date.now(); return g.browser; }
  const browser = await launch(true);
  const timer = setInterval(() => {
    const s = global.__studioBrowser;
    if (s && Date.now() - s.at > 5 * 60_000) { clearInterval(s.timer!); global.__studioBrowser = undefined; s.browser.close().catch(() => {}); }
  }, 60_000);
  (timer as { unref?: () => void }).unref?.();
  global.__studioBrowser = { browser, at: Date.now(), timer };
  return browser;
}

async function newContext(browser: Browser, session: string | null | undefined): Promise<BrowserContext> {
  type State = Exclude<NonNullable<Parameters<Browser["newContext"]>[0]>["storageState"], string | undefined>;
  let storageState: State | undefined;
  try { storageState = session ? (JSON.parse(session) as State) : undefined; } catch { storageState = undefined; }
  // Service Workers off: their fetches pass by context.route (QA pass 6, P6-017)
  const ctx = await browser.newContext({ storageState, locale: "en-IN", timezoneId: "Asia/Kolkata", viewport: { width: 1366, height: 900 }, acceptDownloads: false, serviceWorkers: "block" });
  // a WebSocket is not a request, so context.route never sees it (P6-017): an early, clear refusal here; its connection is a CONNECT
  // through the proxy all the same, and a Worker's WebSocket (which this never sees) is checked there.
  await ctx.routeWebSocket(/.*/, async (ws) => {
    let u: URL;
    try { u = new URL(ws.url().replace(/^ws(s?):/i, "http$1:")); } catch { return ws.close({ code: 1008, reason: "blocked" }); }
    try { await checkHost(u); } catch { return ws.close({ code: 1008, reason: "blocked" }); }
    ws.connectToServer();
  });
  // Workers, SharedWorkers, WebRTC and WebTransport are taken away before a page's own scripts run. Not the defence (the proxy sees
  // their connections too); reading a data page needs none of them, so there is less to go wrong.
  await ctx.addInitScript(() => {
    for (const k of ["Worker", "SharedWorker", "RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "WebTransport"])
      try { Object.defineProperty(globalThis, k, { value: undefined, configurable: false, writable: false }); } catch { /* not there */ }
  });
  // pictures, fonts and media are not needed to read data; a private address is refused here early, with a clear error. The defence
  // is the proxy: a redirect Chromium follows by itself, a POST answered 307 and a second answer to the same GET never come back to
  // this route (QA pass 6, redteam-gate-01 and -04), but every one of them connects through the proxy.
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const t = req.resourceType();
    if (t === "image" || t === "media" || t === "font") return route.abort();
    let u: URL;
    try { u = new URL(req.url()); } catch { return route.abort(); }
    if (u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    try { await checkHost(u); } catch { return route.abort("blockedbyclient"); }
    return route.continue();
  });
  return ctx;
}

const PASSWORD = 'input[type="password"]:visible';

async function hasPassword(page: Page) { return (await page.locator(PASSWORD).count().catch(() => 0)) > 0; }

/** Type the user name and password into the page's own sign-in form and submit it. */
async function signIn(page: Page, username: string, password: string, log: (t: string) => void) {
  const pass = page.locator(PASSWORD).first();
  // the user field: a visible e-mail / text / tel input in the same form, before the password
  const form = pass.locator("xpath=ancestor::form[1]");
  const scope = (await form.count()) ? form : page.locator("body");
  const user = scope.locator('input[type="email"]:visible, input[autocomplete="username"]:visible, input[name*="user" i]:visible, input[name*="email" i]:visible, input[name*="login" i]:visible, input[id*="user" i]:visible, input[id*="email" i]:visible, input[type="text"]:visible, input[type="tel"]:visible, input:not([type]):visible').first();
  if (await user.count()) await user.fill(username, { timeout: 8000 });
  else log("No user-name box found next to the password box; typing the password only.");
  await pass.fill(password, { timeout: 8000 });
  const submit = scope.locator('button[type="submit"]:visible, input[type="submit"]:visible, button:has-text("Sign in"):visible, button:has-text("Log in"):visible, button:has-text("Login"):visible').first();
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {}),
    (await submit.count()) ? submit.click({ timeout: 8000 }) : pass.press("Enter")
  ]);
  await page.waitForTimeout(1200);
  if (await hasPassword(page)) {
    const msg = (await page.locator('[role="alert"], .error, .alert, .invalid-feedback').first().textContent({ timeout: 1000 }).catch(() => null))?.trim();
    throw new LinkError(`The site did not accept the sign-in${msg ? `: "${msg.slice(0, 120)}"` : ""}. Check the user name and password.`, "login");
  }
}

/** Wait for a page that builds itself: the network goes quiet, then a little scrolling for lazy lists. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  for (let k = 0; k < 3; k++) {
    await page.mouse.wheel(0, 2400).catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
}

/** Open the link in a browser (signing in if asked) and return the finished page and the JSON it loaded. */
export async function visit(url: string, opts: VisitOpts = {}): Promise<Visit> {
  const log = opts.log ?? (() => {});
  const manual = !!opts.manual;
  // the addresses this opens itself: a clear refusal before any browser starts (file:, chrome:, a private address)
  for (const raw of [url, opts.login?.loginUrl, opts.manual?.loginUrl]) {
    if (!raw) continue;
    let u: URL;
    try { u = new URL(raw); } catch { throw new LinkError("That is not a valid link.", "invalid"); }
    await checkHost(u);
  }
  const browser = manual ? await launch(false) : await shared();
  const ctx = await newContext(browser, opts.session);
  const json: Captured[] = [];
  let bytes = 0;
  let refusedNav = false;
  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    page.on("response", async (res) => {
      // the page itself was sent on (a redirect, a form) to an address the proxy refused: the latest main-frame document decides
      try { if (res.request().isNavigationRequest() && res.frame() === page.mainFrame()) refusedNav = !!res.headers()[REFUSED_HEADER]; } catch { /* a closed frame */ }
      try {
        const t = res.request().resourceType();
        if ((t !== "xhr" && t !== "fetch") || json.length >= 40 || !/json/i.test(res.headers()["content-type"] ?? "")) return;
        const text = await res.text();
        if (text.length < 200 || bytes + text.length > MAX_BYTES) return;
        bytes += text.length;
        json.push({ url: res.url(), text, status: res.status() });
      } catch { /* a response the page closed */ }
    });
    let signedIn: Visit["signedIn"] = opts.session ? "reused" : "none";

    if (manual) {
      log("A browser window opened on this computer: sign in there. The Studio waits up to 4 minutes and keeps the session.");
      await page.goto(opts.manual!.loginUrl || url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const until = Date.now() + 4 * 60_000;
      // signed in: the password box has gone (and stays gone) or the window has left the sign-in page
      let seenLogin = await hasPassword(page);
      for (;;) {
        if (page.isClosed()) throw new LinkError("The sign-in window was closed before signing in.", "login");
        const pw = await hasPassword(page);
        if (pw) seenLogin = true;
        if (seenLogin && !pw) break;
        if (!seenLogin && Date.now() > until - 3.5 * 60_000) break; // no sign-in form ever appeared: already signed in
        if (Date.now() > until) throw new LinkError("Nobody signed in within 4 minutes.", "login");
        await page.waitForTimeout(1500);
      }
      signedIn = "manual";
      log("Signed in. Keeping the session for the next refreshes.");
    }

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e) => {
      throw new LinkError(/timeout/i.test(String(e)) ? "The page took too long to open in the browser." : "The page could not be opened in the browser.", "timeout");
    });
    await settle(page);

    if (await hasPassword(page)) {
      if (!opts.login) throw new LinkError("The page asks for a sign-in. Add it with its sign-in details, or choose \"I'll sign in myself\".", "auth");
      if (opts.session) log("The kept session has expired: signing in again.");
      else log("Signing in with the saved account.");
      if (opts.login.loginUrl && opts.login.loginUrl !== page.url()) {
        await page.goto(opts.login.loginUrl, { waitUntil: "domcontentloaded" });
        await settle(page);
      }
      await signIn(page, opts.login.username, opts.login.password, log);
      signedIn = "fresh";
      log("Signed in.");
      json.length = 0;
      bytes = 0;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await settle(page);
      if (await hasPassword(page)) throw new LinkError("Signed in, but the page still asks for a sign-in: this account may not have access to it.", "login");
    } else if (opts.login && !opts.session) {
      // a site whose sign-in page is separate: sign in there first, then come back
      if (opts.login.loginUrl) {
        log("Signing in on the site's sign-in page.");
        await page.goto(opts.login.loginUrl, { waitUntil: "domcontentloaded" });
        await settle(page);
        if (await hasPassword(page)) {
          await signIn(page, opts.login.username, opts.login.password, log);
          signedIn = "fresh";
          json.length = 0;
          bytes = 0;
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await settle(page);
        }
      }
    }
    if (refusedNav) throw new LinkError("The page sent the Studio on to a private network address, which cannot be read.", "private");
    const html = await page.content();
    const title = await page.title().catch(() => "");
    const session = signedIn !== "none" ? JSON.stringify(await ctx.storageState()) : opts.session ?? null;
    return { html, url: page.url(), title, json, session, signedIn };
  } finally {
    await ctx.close().catch(() => {});
    if (manual) await browser.close().catch(() => {});
  }
}

/** Whether a browser can be started here (for the page to say so before a sign-in is chosen). */
export async function browserReady(): Promise<boolean> {
  try { await shared(); return true; } catch { return false; }
}

/**
 * A page of the Studio's own (the dataset brief) printed to PDF. It is set as content (no address is opened) and no
 * request leaves the page: everything it needs is inside it.
 */
export async function printPdf(html: string): Promise<Buffer> {
  const browser = await shared();
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await ctx.newPage();
    await page.route("**/*", (r) => r.abort());
    await page.setContent(html, { waitUntil: "load" });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" } }));
  } finally {
    await ctx.close().catch(() => {});
  }
}
