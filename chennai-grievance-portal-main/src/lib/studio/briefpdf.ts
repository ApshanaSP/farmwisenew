/**
 * The dataset brief as a PDF, in English or Tamil: its data card, the top three insights and the "Needs action"
 * table. It is drawn as a page (HTML, with the Noto Sans Tamil font embedded, so Tamil letters join as they should;
 * jsPDF cannot shape Tamil) and printed to PDF by the same browser the connector uses. With no browser on the server,
 * the page itself is returned, ready for the browser's own "Save as PDF".
 */
import fs from "fs";
import path from "path";
import type { DataCard } from "@/lib/studio/datacard";
import type { Brief, DatasetMeta } from "@/lib/studio/types";
import { fmtDay } from "@/lib/studio/values";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const n = (x: number) => x.toLocaleString("en-IN");

const L = {
  en: { title: "Dataset brief", source: "Source", rows: "Rows", read: "read", left: "left out", used: "used", dates: "Dates", family: "Kind of data", reading: "Read by", checks: "Checks passed",
    top: "What matters most", act: "Needs action", what: "What", now: "Next step", owner: "Suggested owner", conf: "Evidence", none: "Nothing needs action now.", made: "Made by District IQ's Data Studio on", note: "Every number is computed from the dataset's rows by code; an AI only chose and explained. Owners are suggestions: nothing was sent." },
  ta: { title: "தரவுச் சுருக்கம்", source: "மூலம்", rows: "வரிசைகள்", read: "படித்தவை", left: "விலக்கியவை", used: "பயன்பட்டவை", dates: "தேதிகள்", family: "தரவின் வகை", reading: "படித்தது", checks: "தேறிய சோதனைகள்",
    top: "முக்கியமானவை", act: "நடவடிக்கை தேவை", what: "என்ன", now: "அடுத்த படி", owner: "பரிந்துரைக்கும் பொறுப்பாளர்", conf: "ஆதாரம்", none: "இப்போது நடவடிக்கை தேவைப்படுவது எதுவும் இல்லை.", made: "District IQ தரவு ஸ்டுடியோ உருவாக்கியது:", note: "ஒவ்வொரு எண்ணும் வரிசைகளிலிருந்து நிரலால் கணக்கிடப்பட்டது; AI தேர்ந்தெடுத்து விளக்கியது மட்டுமே. பொறுப்பாளர்கள் பரிந்துரைகள் மட்டுமே: எதுவும் அனுப்பப்படவில்லை." }
};

let fontCss: string | null = null;
/** The Tamil font, embedded (the PDF needs no network). */
function font(): string {
  if (fontCss != null) return fontCss;
  const dir = path.join(process.cwd(), "node_modules", "@fontsource-variable", "noto-sans-tamil", "files");
  try {
    const face = (file: string, range: string) => `@font-face{font-family:"Noto Sans Tamil";src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, file)).toString("base64")}) format("woff2");font-weight:100 900;unicode-range:${range}}`;
    fontCss = face("noto-sans-tamil-tamil-wght-normal.woff2", "U+0B80-0BFF,U+200C-200D,U+25CC") + face("noto-sans-tamil-latin-wght-normal.woff2", "U+0000-00FF,U+2000-206F,U+20B9");
  } catch { fontCss = ""; }
  return fontCss;
}

export function briefHtml(meta: DatasetMeta, brief: Brief, card: DataCard, lang: "en" | "ta"): string {
  const t = L[lang];
  const top = brief.items.slice(0, 3);
  const act = brief.items.filter((x) => x.priority === "act");
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(meta.name)}</title><style>${font()}
  @page{size:A4;margin:16mm 14mm}
  body{font-family:"Noto Sans Tamil",Arial,sans-serif;color:#111;font-size:10.5pt;line-height:1.45;margin:0}
  h1{font-size:18pt;margin:0 0 2pt}h2{font-size:11pt;margin:14pt 0 6pt;padding-bottom:3pt;border-bottom:1.5pt solid #1f5133;color:#1f5133}
  .sub{color:#555;margin:0 0 8pt}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6pt 14pt}.k{color:#555;font-size:9pt}
  .item{border:1pt solid #ccc;border-radius:6pt;padding:7pt 9pt;margin:0 0 7pt;break-inside:avoid}.item b{font-size:11pt}
  table{width:100%;border-collapse:collapse;font-size:9.5pt}th,td{border:1pt solid #bbb;padding:4pt 6pt;text-align:left;vertical-align:top}th{background:#eef3ef}
  .foot{margin-top:14pt;color:#555;font-size:8.5pt}.tag{display:inline-block;padding:0 5pt;border-radius:8pt;background:#fde7c8;font-size:8.5pt}
  </style></head><body>
  <h1>${esc(meta.name)}</h1><p class="sub">${esc(t.title)} · ${esc(brief.verdict)}</p>
  <h2>${esc(t.source)}</h2>
  <div class="grid">
    <div><div class="k">${esc(t.source)}</div>${esc(card.source.how)}<br><span class="k">${esc(card.source.terms)}</span></div>
    <div><div class="k">${esc(t.rows)}</div>${n(card.rows.read)} ${esc(t.read)} → ${n(card.rows.read - card.rows.used)} ${esc(t.left)} → <b>${n(card.rows.used)}</b> ${esc(t.used)}</div>
    <div><div class="k">${esc(t.dates)}</div>${card.dates.from ? `${esc(fmtDay(card.dates.from))} – ${esc(fmtDay(card.dates.to))}` : "—"}</div>
    <div><div class="k">${esc(t.family)}</div>${esc(card.family?.name ?? "—")}</div>
    <div><div class="k">${esc(t.reading)}</div>${card.reading.by === "ai" ? `AI (${esc(card.reading.model)})` : "Rules"}</div>
    <div><div class="k">${esc(t.checks)}</div>${card.checks.filter((k) => k.ok).map((k) => esc(k.label)).join(" · ")}</div>
  </div>
  <h2>${esc(t.top)}</h2>
  ${top.map((x) => `<div class="item"><b>${esc(x.headline || x.title)}</b> ${x.priority === "act" ? `<span class="tag">${esc(t.act)}</span>` : ""}<br>${esc(x.text)}<br><span class="k">${esc(x.why)}</span>${x.confidence ? `<br><span class="k">${esc(t.conf)}: ${esc(x.confidence)}</span>` : ""}</div>`).join("")}
  <h2>${esc(t.act)}</h2>
  ${act.length ? `<table><thead><tr><th>${esc(t.what)}</th><th>${esc(t.now)}</th><th>${esc(t.owner)}</th></tr></thead><tbody>${act.map((x) => `<tr><td>${esc(x.headline || x.title)}</td><td>${esc(x.action ?? "—")}</td><td>${esc(x.owner ?? "—")}</td></tr>`).join("")}</tbody></table>` : `<p>${esc(t.none)}</p>`}
  <p class="foot">${esc(t.made)} ${esc(fmtDay(today))}. ${esc(t.note)}</p>
  </body></html>`;
}

/** The brief printed to PDF by the server's browser, or null when no browser can be started (the page is used). */
export async function htmlToPdf(html: string): Promise<Buffer | null> {
  try {
    const { printPdf } = await import("@/lib/studio/connect/browser");
    return await printPdf(html);
  } catch (e) {
    console.warn("[studio] brief PDF: no browser, the page is sent instead:", (e as Error).message.slice(0, 120));
    return null;
  }
}
