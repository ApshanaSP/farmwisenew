// The browser half of per-tab sessions (lib/session-cookies.ts), as an inline script the root layout runs before
// the app loads, so every fetch the app makes (and Next's own page fetches) already carries the tab's slot.
//
// - The slot lives in sessionStorage, so it belongs to this tab and survives reloads.
// - A tab with no slot yet (a new tab) takes a new one and copies into it the sign-ins of the tab the page was
//   served for (the dcd_tab cookie), or of the unslotted cookies from before per-tab sessions.
// - A duplicated tab inherits its parent's sessionStorage, slot included; the two find each other over a
//   BroadcastChannel and the newer one moves to a copy of its own, so signing out of one leaves the other signed in.
// - The dcd_tab cookie names the tab in use (shown, clicked, typed in, or navigating), for page loads, which
//   cannot carry a header.

const script = function () {
  try {
    var KEY = "dcd_tab";
    var store = window.sessionStorage;
    var nativeFetch = window.fetch.bind(window);
    var newSlot = function () {
      return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).slice(0, 16);
    };
    var served = (document.cookie.match(/(?:^|; )dcd_tab=([a-z0-9]{6,24})(?:;|$)/) || [])[1] || null;
    var mine = store.getItem(KEY);
    // the slot this tab's requests use; "-" = the unslotted cookies
    var active = mine || served || "-";
    var moving = false;
    // the tab's requests wait while it moves to its own slot, so a quick sign-in is never written to the
    // slot it is leaving (another tab's, or the unslotted cookies the move clears)
    var ready: Promise<unknown> = Promise.resolve();

    var mark = function () {
      if (active !== "-") document.cookie = "dcd_tab=" + active + "; path=/; SameSite=Lax";
    };
    var moveTo = function (to: string) {
      if (moving) return;
      moving = true;
      var attempt = function (left: number): Promise<unknown> {
        return nativeFetch("/api/auth/tab", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ from: active, to: to }),
          credentials: "same-origin"
        })
          .then(function (r) {
            if (!r.ok) throw new Error("tab " + r.status);
            active = to;
            store.setItem(KEY, to);
            if (!document.hidden) mark();
          })
          .catch(function () {
            // a dev server still compiling the route: try again shortly, then carry on as before
            if (left > 0) return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return attempt(left - 1); });
          });
      };
      ready = attempt(3).then(function () {
        moving = false;
      });
    };

    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      var same = false;
      try {
        var url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        same = new URL(url, location.href).origin === location.origin;
      } catch (e) {}
      if (!same) return nativeFetch(input, init);
      return ready.then(function () {
        var headers = new Headers(init && init.headers ? init.headers : input instanceof Request ? input.headers : undefined);
        headers.set("x-dcd-tab", active);
        return nativeFetch(input, Object.assign({}, init, { headers: headers }));
      });
    };

    if (!mine) moveTo(newSlot());
    mark();
    var onUse = function () {
      if (!document.hidden) mark();
    };
    ["focus", "pageshow", "visibilitychange"].forEach(function (t) {
      window.addEventListener(t, onUse);
    });
    // a reload or navigation, even one the page starts while in the background, loads as this tab
    window.addEventListener("beforeunload", mark);
    ["pointerdown", "keydown"].forEach(function (t) {
      window.addEventListener(t, onUse, true);
    });

    if (mine && "BroadcastChannel" in window) {
      var born = Date.now() + Math.random();
      var channel = new BroadcastChannel("dcd-tabs");
      channel.onmessage = function (e) {
        var d = e.data || {};
        if (d.slot !== active || d.born === born) return;
        if (d.hello) channel.postMessage({ slot: active, born: born });
        // two live tabs on one slot: the newer one (the duplicate) moves to its own copy
        if (d.born < born) moveTo(newSlot());
      };
      channel.postMessage({ slot: active, born: born, hello: true });
    }
  } catch (e) {}
};

export const TAB_SESSION_SCRIPT = "(" + script.toString() + ")()";
