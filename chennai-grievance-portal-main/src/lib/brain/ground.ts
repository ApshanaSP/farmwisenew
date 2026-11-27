/**
 * The guard against invention. Before an answer is said or shown, code checks it against what was actually read in the conversation: every figure
 * (in digits or in words), every time, every phone number, every zone, department, newspaper and hospital it names, and every "there is none".
 * A sentence that fails goes back to the model once or twice with exactly what is not in the records; what still fails is not said. Pure.
 */
import { figuresIn } from "@/lib/thunai/numbergate";
import { asciiDigits } from "@/lib/thunai/digits";
import type { World } from "@/lib/thunai/types";
import type { Evidence, FinalAnswer } from "./types";
import { outText } from "./format";

const NUM = /\d[\d,]*(?:\.\d+)?/g;
const norm = (x: string) => String(Number(x.replace(/,/g, "")));

export interface Known { nums: Set<string>; text: string; looked: boolean; counts: Set<number> }

/** every figure and word the conversation's results hold (with the roundings a sentence may use) */
export function knownOf(evidence: Evidence[], said: string[]): Known {
  const nums = new Set<string>(), counts = new Set<number>();
  const texts: string[] = [];
  const add = (v: number) => { if (!Number.isFinite(v)) return; for (const x of [v, Math.abs(v), Math.round(Math.abs(v)), Math.round(Math.abs(v) * 10) / 10, Math.round(Math.abs(v) * 100) / 100]) nums.add(String(x)); };
  const addText = (t: string) => { for (const m of asciiDigits(t).match(NUM) ?? []) { add(Number(m.replace(/,/g, ""))); nums.add(norm(m)); } };
  for (const e of evidence) {
    const t = outText(e.id, e.out, 400);
    texts.push(t);
    addText(t);
    for (const p of e.out.parts) {
      counts.add(p.rows.length);
      if (p.total != null) { counts.add(p.total); add(p.total); }
      for (const r of p.rows) for (const v of Object.values(r)) { if (typeof v === "number") add(v); else if (typeof v === "string") addText(v); }
    }
    addText(JSON.stringify(e.input));
  }
  for (const s of said) { addText(s); for (const f of figuresIn(s)) add(f.value); texts.push(s); }
  return { nums, text: texts.join("\n").toLowerCase(), looked: evidence.length > 0, counts };
}

/** the figures of a line that no result holds */
export function strayFigures(line: string, k: Known): string[] {
  const out: string[] = [];
  // spans and clock words that are the window, not a finding ("the last 7 days", "24 hours", "12 AM")
  const t = asciiDigits(line).replace(/\b(?:last|past|previous|next|within|over the)\s+\d+\s*(?:hours?|days?|weeks?|months?|years?)\b/gi, " ").replace(/\b12(?::00)?\s*AM\b/gi, " ").replace(/\b(?:20\d\d|1913|100|108|112)\b/g, (m) => (m.startsWith("20") ? " " : m));
  for (const f of figuresIn(t)) {
    const v = f.value;
    if (!Number.isFinite(v)) continue;
    // a scale word is the record's own unit: "178.85 lakh" stands when 178.85 is held (the column is in lakhs), and "crore" alone is no figure
    const bare = f.raw.replace(/\s*(?:lakhs?|crores?|thousand|hundred|million|billion|லட்சம்|இலட்சம்|கோடி|ஆயிரம்|நூறு)\s*$/i, "").trim();
    if (!bare) continue;
    if (bare !== f.raw && /^[\d.,]+$/.test(bare) && k.nums.has(norm(bare))) continue;
    if (k.nums.has(String(v)) || k.nums.has(String(Math.abs(v)))) continue;
    if (f.words && (v <= 3 || k.counts.has(v))) continue;
    // a count of what is shown ("these 5 zones"), an ordinal of a shown row
    if (Number.isInteger(v) && v <= 12 && [...k.counts].some((c) => c >= v) && new RegExp(`\\b${f.raw}(?:st|nd|rd|th)\\b`).test(t)) continue;
    out.push(f.raw);
  }
  return [...new Set(out)];
}

/** names the answer uses that nothing in the conversation mentions (a zone, a department, a newspaper: never from memory) */
export function strayNames(line: string, k: Known, w: World): string[] {
  const low = ` ${line.toLowerCase().replace(/[^a-z0-9.& ]+/g, " ").replace(/\s+/g, " ")} `;
  const out: string[] = [];
  const names = [...w.zones.map((z) => z.name), ...w.taluks.map((t) => t.name), ...PAPERS];
  for (const n of names) {
    const x = n.toLowerCase();
    if (x.length < 5 || !low.includes(` ${x} `)) continue;
    if (!k.text.includes(x)) out.push(n);
  }
  return [...new Set(out)];
}
const PAPERS = ["The Hindu", "Times of India", "DT Next", "New Indian Express", "Dinamalar", "Dinamani", "Dinakaran", "Daily Thanthi", "Deccan Chronicle", "Polimer News", "Thanthi TV", "Puthiya Thalaimurai", "News18"];

/** a sentence that corrects itself half way is not a finished one */
export const SLIP = /(?:\.\.\.|…|—|\s-\s)\s*(?:no|sorry|wait|actually|correction|or rather|rather|i mean|to be exact|make that|that is wrong)\b|\bwhich is actually\b|\bcorrection:/i;
const NONE_SAID = /\b(?:does not hold|do not hold|is not held|not available|no data|no information|don't have|do not have|cannot find|could not find|not recorded|no record)\b|தகவல் இல்லை|தரவு இல்லை|பதிவு இல்லை/i;
const DISTRICT_NOUN = /\b(?:incidents?|cases?|complaints?|reports?|beds?|lakes?|zones?|deaths|injured|overdue|severe)\b/i;

export interface Verdict { ok: boolean; stray: string[]; why: string[] }

export function checkAnswer(a: FinalAnswer, k: Known, w: World, o: { toolsRun: number; wantLang?: "en" | "ta" | null }): Verdict {
  // a decline's words are code's own (topicguard/reply.ts): nothing in them to check
  if (a.kind === "offtopic") return { ok: true, stray: [], why: [] };
  const why: string[] = [], stray: string[] = [];
  const lines = [a.say, ...a.points, a.title];
  if (a.kind === "answer") {
    for (const l of lines) { stray.push(...strayFigures(l, k)); const n = strayNames(l, k, w); if (n.length) why.push(`${n.join(", ")} is in no result (call the tool that reads it, or leave it out)`); }
    if (stray.length) why.push(`these figures are in no result: ${[...new Set(stray)].slice(0, 10).join(", ")} (copy a figure from a result, use calc for one you work out, or leave it out)`);
  }
  // (sentence by sentence: "A cusec is one cubic foot a second, about 28.3 litres. Lake releases are given in cusecs." states no district figure)
  if (a.kind === "chat" && sentences(a.say).some((l) => DISTRICT_NOUN.test(l) && strayFigures(l, k).length)) why.push("a figure about the district needs a tool result");
  if ((a.kind === "answer" || a.kind === "chat") && NONE_SAID.test(a.say) && o.toolsRun === 0) why.push("you said it is not held without looking: call a tool first (the fitting one, else search, else schema and sql)");
  if (a.kind === "clarify" && a.options.length < 2) why.push("give two to four choices with the question, each a whole request");
  if (!a.say.trim()) why.push("say is empty");
  if (/^\W*(?:placeholder|n\/?a|tbd|todo|lorem|\.{2,}|answer|text|string|pending|null|undefined)\W*$/i.test(a.say)) why.push("say holds no answer: call the tools, then write it");
  if (lines.some((l) => SLIP.test(l))) why.push("a sentence corrects itself half way: write it once, right");
  if (o.wantLang === "ta" && a.kind !== "chat" && !/[஀-௿]/.test(a.say)) why.push("the Collector spoke Tamil: answer in Tamil script");
  if (o.wantLang === "en" && /[஀-௿]/.test(a.say)) why.push("the Collector spoke English: answer in English");
  if (/\br\d+(?:\.\w+)?\b/.test(`${a.say} ${a.points.join(" ")}`)) why.push("leave out result keys like r2");
  if (/\bINC-\d/.test(a.say)) why.push("do not read incident ids aloud in say");
  return { ok: !why.length, stray: [...new Set(stray)], why };
}

/** what may be said of an answer that still fails: the sentences that pass */
export function keepSound(a: FinalAnswer, k: Known, w: World): FinalAnswer {
  const good = (l: string) => !SLIP.test(l) && !strayFigures(l, k).length && !strayNames(l, k, w).length;
  // (a scrap left of a sentence, "Area.", is not said)
  const say = sentences(a.say).filter((l) => good(l) && (l.match(/[\p{L}\p{M}\d]+/gu) ?? []).length >= 2).join(" ").trim();
  return { ...a, say, points: a.points.filter(good), title: good(a.title) ? a.title : "" };
}

/** sentences, without splitting M.K.B. Nagar, 6.5, Rs. 40 */
export function sentences(t: string): string[] {
  return t.replace(/\s+/g, " ").trim().split(/(?<=[.!?।])\s+(?=["'(]?[\p{Lu}\p{Lo}\d])/u).reduce<string[]>((out, x) => {
    const last = out.at(-1);
    if (last && /(?:\b[A-Z]|\b(?:Rs|Mr|Mrs|Ms|Dr|St|No|Nos|approx|vs))\.$/.test(last)) out[out.length - 1] = `${last} ${x}`;
    else out.push(x);
    return out;
  }, []).map((x) => x.trim()).filter(Boolean);
}
