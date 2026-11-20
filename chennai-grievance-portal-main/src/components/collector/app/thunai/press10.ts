/**
 * v10: what Jarvis may press, and how, as pure rules (dom.ts runs them on the page; controls.v10.test.ts checks them). No DOM here.
 *   - pressVerdict: the one guard for a spoken click and a registry control: data-jarvis-never always refuses; the danger words (skeleton.ts
 *     DANGER_BUTTON) and the keep words (guards.ts) refuse unless the element is on PRESS_ALLOW (harmless controls whose name holds such a word)
 *   - pressKind: a checkbox is ticked by a click, a select is set, a text box focused, anything else clicked (the inventory: press() only focused
 *     selects and checkboxes, so neither could be changed by voice)
 *   - bestOption: the option of a select that a spoken value names
 *   - ITEM_ROWS: the rows of each window's list, for "open the third one" in the window open
 *   - TARGETS: where the pointer glides for a step (dom.ts targetFor); every selector names an element the console has
 *   - parseSpec: a registry press selector ("css", "css::words|words", "a >> b")
 */
import { isDangerButton } from "@/lib/thunai/skeleton";
import { keepsSomething } from "./guards";

/** Harmless controls whose name holds a danger or keep word, let through by element (never by weakening the words): the chatbot's Send (the
 * Collector's own question to District IQ), Ask the Map's "Remove <part>" on a chip of the question, the workspace delete question's Keep (it
 * cancels the delete), a dataset's focus chip's Remove (a view filter) */
export const PRESS_ALLOW: string[] = [".aq-send", ".amp .rm[role=button]", ".wdel .btn.plain", ".ds-focus em button"];

export type Verdict = "ok" | "never" | "keep";
/**
 * May Jarvis press this element? `never`: it carries data-jarvis-never; `allowed`: it matches PRESS_ALLOW; `yes`: the Collector said yes to a
 * level-B control just now (keeping is then what was asked).
 */
export function pressVerdict(o: { name: string | null | undefined; text: string | null | undefined; never: boolean; allowed: boolean; yes?: boolean }): Verdict {
  if (o.never) return "never";
  if (o.allowed) return "ok";
  if (isDangerButton(`${o.name ?? ""} ${o.text ?? ""}`)) return "never";
  if (!o.yes && keepsSomething(o.name, o.text)) return "keep";
  return "ok";
}

export type PressKind = "click" | "check" | "select" | "focus";
/** How a control is pressed, by its tag and type. */
export function pressKind(tag: string, type: string | null | undefined): PressKind {
  const t = tag.toUpperCase(), ty = String(type ?? "").toLowerCase();
  if (t === "SELECT") return "select";
  if (t === "TEXTAREA") return "focus";
  if (t === "INPUT") return ty === "checkbox" || ty === "radio" ? "check" : ["button", "submit", "reset", "image"].includes(ty) ? "click" : "focus";
  return "click";
}

const fold = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
/** how alike two words are: 1 the same, by the letters they share in order otherwise (Levenshtein over the longer) */
function alike(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}
/** The value of the option a spoken value names ("nungambakam" -> Nungambakkam, "high" -> High, "all" -> All stations), or null. */
export function bestOption(options: { text: string; value: string }[], said: string): string | null {
  const q = fold(said);
  if (!q) return null;
  const qw = q.split(" ");
  let best: { v: string; s: number } | null = null;
  for (const o of options) {
    const t = fold(o.text);
    if (!t) continue;
    const tw = t.split(" ");
    // every word said is a word of the option (or close to one), scored by how well, and a little for covering the option's words
    const per = qw.map((w) => Math.max(...tw.map((x) => (x.startsWith(w) && w.length >= 3 ? 0.97 : alike(w, x)))));
    const s = Math.min(...per) + 0.01 * (qw.length / tw.length) + (t === q ? 0.1 : 0);
    if (Math.min(...per) >= 0.8 && (!best || s > best.s)) best = { v: o.value, s };
  }
  return best ? best.v : null;
}

/** the rows of each window's own list, in the order shown (CollectorApp.tsx's windows; Overlays, Insights, Stories, Added, Nearby) */
export const ITEM_ROWS: Record<string, string> = {
  list: ".modal .tbl-wrap tbody tr",
  zones: ".modal tbody tr",
  depts: ".modal tbody tr",
  news: ".modal button.ncard",
  added: ".modal button.ncard",
  stories: ".modal button.thv-i",
  gaps: ".modal button.rt",
  review: ".modal button.rv-open",
  nextdoor: ".modal button.nd-row",
  pattern: ".modal button.pt-i"
};

/** where the pointer glides for a step: the first that is on screen (a menu's item while the menu is open, else the Menu button) */
export const TARGETS: Record<"theme" | "export" | "workspace" | "customize" | "sev" | "palette" | "assistant", string[]> = {
  theme: [".tm-pop [data-key=\"theme\"]", ".tm-btn"],
  export: [".tm-pop [data-key=\"export\"]", ".tm-btn"],
  workspace: [".tm-pop [data-key=\"ws\"]", ".tm-btn"],
  customize: [".tm-pop [data-key=\"custom\"]", ".tm-btn"],
  sev: [".att-pills [role=tab]"],
  palette: [".cmdk"],
  assistant: [".ask-fab"]
};

/** A registry press selector, step by step: "css" or "css::words|words", several joined by " >> " (a menu, then its item). */
export function parseSpec(spec: string): { css: string; words: string[] }[] {
  return spec.split(" >> ").map((part) => {
    const k = part.indexOf("::");
    return k < 0 ? { css: part.trim(), words: [] } : { css: part.slice(0, k).trim(), words: part.slice(k + 2).split("|").map((w) => w.trim().toLowerCase()).filter(Boolean) };
  });
}
