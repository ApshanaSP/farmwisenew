/**
 * v10: a storm in the news brings the weather readings with it (docs/jarvis/JARVIS_V10.md 4.4: "For a weather event it also goes to the weather
 * readings: the rain gauges, the IMD forecast"). Said by code from the console's own readings (the environment tool: the last 24 hours' rain per
 * gauge, IMD's warning level today and the days ahead), every figure the record's own. No model, nothing guessed: no reading, no line.
 *
 * Pure but for the tool call it is given (the news route passes the server's tool runner).
 */
import type { ToolResult } from "@/lib/assistant/types";

type Tool = (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
interface RainRow { place: string; value: number; t?: string | null }
interface Ahead { date: string; level: number; text?: string }

const LEVEL_EN = ["green (no warning)", "yellow", "orange", "red"];
const LEVEL_TA = ["பச்சை (எச்சரிக்கை இல்லை)", "மஞ்சள்", "ஆரஞ்சு", "சிவப்பு"];
const MONTH_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_TA = ["ஜனவரி", "பிப்ரவரி", "மார்ச்", "ஏப்ரல்", "மே", "ஜூன்", "ஜூலை", "ஆகஸ்ட்", "செப்டம்பர்", "அக்டோபர்", "நவம்பர்", "டிசம்பர்"];
const day = (iso: string, lang: "en" | "ta") => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return lang === "ta" ? `${MONTH_TA[Number(m[2]) - 1]} ${Number(m[3])}` : `${Number(m[3])} ${MONTH_EN[Number(m[2]) - 1]}`;
};
const mm = (v: number) => (Math.round(v * 10) / 10).toString();

export interface WeatherLines { en: string[]; ta: string[]; facts: string[] }

/** The weather readings for a storm, as two or three lines in each language; null when the console has no reading at all. */
export async function weatherLines(tool: Tool): Promise<WeatherLines | null> {
  const [rain, warn] = await Promise.all([
    tool("environment", { metric: "rainfall_24h_mm" }).catch(() => null),
    tool("environment", { metric: "imd_warning_level" }).catch(() => null)
  ]);
  const en: string[] = [], ta: string[] = [], facts: string[] = [];
  const rows = (((rain?.data as { rows?: RainRow[] } | undefined)?.rows) ?? []).filter((r) => r && typeof r.value === "number" && Number.isFinite(r.value));
  if (rows.length) {
    const top = [...rows].sort((a, b) => b.value - a.value)[0];
    const wet = rows.filter((r) => r.value > 0).length;
    if (top.value > 0) {
      en.push(`The rain gauges: the most in the last 24 hours is ${mm(top.value)} mm at ${top.place}; ${wet} of ${rows.length} gauges had rain.`);
      ta.push(`மழைமானிகள்: கடந்த 24 மணி நேரத்தில் அதிகபட்சம் ${mm(top.value)} மி.மீ, ${top.place}; ${rows.length} மழைமானிகளில் ${wet}-இல் மழை.`);
    } else {
      en.push(`The rain gauges: no rain in the last 24 hours at any of the ${rows.length} gauges.`);
      ta.push(`மழைமானிகள்: கடந்த 24 மணி நேரத்தில் ${rows.length} மழைமானிகளிலும் மழை இல்லை.`);
    }
    facts.push(`rain24h.max=${top.value}@${top.place}`, `rain24h.wet=${wet}/${rows.length}`);
  }
  const d = warn?.data as { warning?: { level: number; t: string } | null; ahead?: Ahead[] } | undefined;
  const ahead = (d?.ahead ?? []).filter((a) => a && Number.isFinite(a.level));
  const worst = ahead.length ? [...ahead].sort((a, b) => b.level - a.level || a.date.localeCompare(b.date))[0] : null;
  if (worst && worst.level > 0) {
    en.push(`IMD's warning for ${day(worst.date, "en")} is ${LEVEL_EN[Math.min(3, worst.level)]}.`);
    ta.push(`${day(worst.date, "ta")} அன்று IMD எச்சரிக்கை: ${LEVEL_TA[Math.min(3, worst.level)]}.`);
    facts.push(`imd.${worst.date}=${worst.level}`);
  } else if (d?.warning && Number.isFinite(d.warning.level)) {
    en.push(`IMD's warning level in force is ${LEVEL_EN[Math.min(3, Math.max(0, d.warning.level))]}.`);
    ta.push(`இப்போதைய IMD எச்சரிக்கை நிலை: ${LEVEL_TA[Math.min(3, Math.max(0, d.warning.level))]}.`);
    facts.push(`imd.now=${d.warning.level}`);
  }
  return en.length ? { en, ta, facts } : null;
}
