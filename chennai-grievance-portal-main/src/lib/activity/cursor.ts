/**
 * Cursors, site-wide (the Collector and officer consoles, the citizen portal, the sign-in pages). The CSS in globals.css gives the
 * arrow over page text, the text cursor (and a blinking caret) only where something can be typed, and the hand on buttons, links,
 * tabs and the like. Many of the site's cards, rows and pills are plain elements with a React click handler, which CSS cannot see:
 * this marks each one the first time the pointer passes over it (data-clk), so it shows the hand too.
 *
 * Not marked: anything typed into, anything that already has its own cursor (the map's grab, a disabled not-allowed), a backdrop
 * that only closes a dialog (it covers most of the screen), and a wrapper whose handler only stops the click going further.
 */
const CLICK = ["onClick", "onMouseDown", "onPointerDown", "onMouseUp", "onDoubleClick"] as const;
const ONLY_STOP = /^(?:function)?\(?(\w+)\)?(?:=>)?\{?(?:return)?\1\.stopPropagation\(\);?\}?$/;

function propsOf(el: Element): Record<string, unknown> | null {
  for (const k in el) if (k.startsWith("__reactProps$")) return (el as unknown as Record<string, Record<string, unknown> | null>)[k];
  return null;
}

/** a real click handler (not one that only stops the click from going on) */
export function clickHandler(p: Record<string, unknown> | null): boolean {
  if (!p) return false;
  return CLICK.some((n) => {
    const f = p[n];
    return typeof f === "function" && !ONLY_STOP.test(String(f).replace(/\s+/g, ""));
  });
}

/** where the Collector types: the text cursor stays there */
export function typable(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !el.readOnly && !el.disabled && !/^(checkbox|radio|button|submit|reset|file|range|color|image|hidden)$/.test(el.type);
  return (el as HTMLElement).isContentEditable === true;
}

let installed = false;
export function installCursor(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const seen = new WeakSet<Element>();
  document.addEventListener("pointerover", (e) => {
    let el = e.target instanceof Element ? e.target : null;
    for (let depth = 0; el && el !== document.body && depth < 8; depth++, el = el.parentElement) {
      if (seen.has(el)) return;
      seen.add(el);
      if (el.hasAttribute("data-clk") || typable(el)) return;
      if (!clickHandler(propsOf(el))) continue;
      const cs = getComputedStyle(el);
      if (cs.cursor !== "auto" && cs.cursor !== "text" && cs.cursor !== "default") return;
      if (el.getAttribute("aria-disabled") === "true" || (el as HTMLButtonElement).disabled) return;
      const r = el.getBoundingClientRect();
      // a full-screen backdrop that closes a dialog is not a button
      if (r.width * r.height > 0.4 * innerWidth * innerHeight) return;
      el.setAttribute("data-clk", "");
      return;
    }
  }, { capture: true, passive: true });
}
