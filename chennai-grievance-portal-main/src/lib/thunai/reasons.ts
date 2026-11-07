/**
 * The reasons a case needs the Collector, and the day's conditions line, in Tamil (QA pass 4, RC-15, PB-207). The briefing tool writes them in English from fixed
 * templates (collector/intel.ts, the `add(weight, ...)` calls in explain(); briefing.conditions), so a Tamil brief read out English sentences. This is the complete
 * list of those templates, each with its Tamil; a test reads intel.ts and fails if a template is added there without a line here. A reason the pipeline's AI
 * wrote (not a template) has no Tamil line: the caller leaves it out of the Tamil reading rather than read an English sentence.
 * Pure: no database.
 */
const N = (s: string) => s.trim();

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(\d+) (?:person has|people have) died$/, (m) => `${m[1]} பேர் உயிரிழந்துள்ளனர்`],
  [/^Still open at more than twice its (\d+)-hour deadline$/, (m) => `${m[1]} மணி நேரக் காலக்கெடுவின் இரு மடங்குக்கும் மேலாகத் திறந்துள்ளது`],
  [/^Past its (\d+)-hour deadline$/, (m) => `${m[1]} மணி நேரக் காலக்கெடுவைத் தாண்டியது`],
  [/^No response yet within the (\d+)-hour target$/, (m) => `${m[1]} மணி நேர இலக்குக்குள் பதில் இல்லை`],
  [/^No officer has confirmed it on the ground yet$/, () => "களத்தில் எந்த அதிகாரியும் இன்னும் உறுதிப்படுத்தவில்லை"],
  [/^In the news, but no department has a record of it$/, () => "செய்தியில் உள்ளது, ஆனால் எந்தத் துறையிலும் பதிவு இல்லை"],
  [/^Reported by (\d+) news outlets$/, (m) => `${m[1]} செய்தி நிறுவனங்கள் வெளியிட்டுள்ளன`],
  [/^(\d+) citizens have complained$/, (m) => `${m[1]} குடிமக்கள் புகார் அளித்துள்ளனர்`],
  [/^Keeps happening: (\d+) similar incidents here in (\d+) days$/, (m) => `தொடர்ந்து நடக்கிறது: ${m[2]} நாட்களில் இங்கு ${m[1]} ஒத்த சம்பவங்கள்`],
  [/^More reports are still coming in$/, () => "மேலும் புகார்கள் தொடர்ந்து வருகின்றன"],
  [/^Needs several departments to act together$/, () => "பல துறைகள் சேர்ந்து செயல்பட வேண்டும்"],
  [/^Past its deadline$/, () => "காலக்கெடுவைத் தாண்டியது"]
];

/** The Tamil of one reason the briefing tool wrote from a template, or null when it is not one of them (an AI-written reason). */
export function reasonTa(reason: string): string | null {
  const s = N(reason).replace(/\.$/, "");
  for (const [re, f] of RULES) { const m = s.match(re); if (m) return f(m); }
  return null;
}

const COND: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^rainfall ([\d.]+) mm in 24 h$/, (m) => `24 மணி நேரத்தில் ${m[1]} மி.மீ மழை`],
  [/^air quality (\d+) AQI$/, (m) => `காற்றின் தரக் குறியீடு ${m[1]}`],
  [/^reservoirs ([\d.]+)% full$/, (m) => `ஏரிகள் ${m[1]}% நிரம்பியுள்ளன`]
];

/** "Conditions: rainfall 5.1 mm in 24 h, air quality 100 AQI, reservoirs 44.1% full" in Tamil; null when a part is not one of these. */
export function conditionsTa(line: string): string | null {
  const parts = N(line).replace(/^Conditions:\s*/i, "").split(/,\s*(?=rainfall|air quality|reservoirs)/);
  const out: string[] = [];
  for (const p of parts) {
    const hit = COND.map(([re, f]) => { const m = p.trim().match(re); return m ? f(m) : null; }).find(Boolean);
    if (!hit) return null;
    out.push(hit);
  }
  return out.length ? `நிலைமைகள்: ${out.join(", ")}` : null;
}
