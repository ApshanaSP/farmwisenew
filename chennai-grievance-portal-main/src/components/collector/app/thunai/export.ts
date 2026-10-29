/**
 * Export a Stage screen, client-side with no new service: a PNG drawn on a canvas from the screen itself (its title,
 * takeaway, each block's text, and every chart's own canvas as it is drawn), and the CSV from lib/thunai/stagelocal.
 * Map tiles come from another site and cannot be copied into a picture, so a map block is shown by its caption.
 */
import type { StageDocT } from "@/lib/thunai/stage";

export function fileName(title: string): string {
  return title.replace(/[^\w஀-௿ -]+/g, "").replace(/\s+/g, " ").slice(0, 60).trim() || "thunai";
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, maxLines = 99): number {
  const words = text.split(/\s+/);
  let line = "", n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) {
      ctx.fillText(line, x, y); y += lh; line = w;
      if (++n >= maxLines) return y;
    } else line = t;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}

const when = (t: string | null) => {
  const m = String(t ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return t ?? "unknown";
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1];
  const h = Number(m[4] ?? 0);
  return `${Number(m[3])} ${mo} ${m[1]}${m[4] != null ? `, ${h % 12 || 12}:${m[5]} ${h < 12 ? "AM" : "PM"}` : ""}`;
};

export async function exportPng(root: HTMLElement, doc: StageDocT, lang: "en" | "ta" = "en"): Promise<void> {
  const cs = getComputedStyle(root);
  const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
  const bg = v("--surface", "#0d1322"), text = v("--text", "#eef2f8"), text2 = v("--text-2", "#b7c2d4"), accent = v("--accent", "#3987e5"), line = v("--line-2", "rgba(255,255,255,.14)");
  const font = cs.fontFamily || "system-ui, sans-serif";
  const W = 1600, pad = 48, colW = (W - pad * 2 - 24) / 2;
  const blocks = [...root.querySelectorAll<HTMLElement>(".st-block")];
  // measure: two columns, each block at most 520 px tall
  const canvas = document.createElement("canvas");
  const scale = 1;
  canvas.width = W * scale;
  canvas.height = 260 + Math.ceil(blocks.length / 2) * 560 + 80;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, canvas.height);
  ctx.fillStyle = accent; ctx.font = `600 18px ${font}`; ctx.fillText("Thunai · District IQ", pad, pad + 6);
  ctx.fillStyle = text; ctx.font = `700 34px ${font}`;
  let y = wrap(ctx, doc.title, pad, pad + 54, W - pad * 2, 42, 2);
  if (doc.takeaway) { ctx.fillStyle = text2; ctx.font = `500 22px ${font}`; y = wrap(ctx, doc.takeaway[lang], pad, y + 8, W - pad * 2, 30, 2); }
  y += 18;
  let colY = [y, y];
  for (let i = 0; i < blocks.length; i++) {
    const col = colY[0] <= colY[1] ? 0 : 1;
    const x = pad + col * (colW + 24);
    let by = colY[col];
    const el = blocks[i];
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    const top = by;
    by += 30;
    ctx.fillStyle = text; ctx.font = `700 20px ${font}`;
    const h3 = el.querySelector("h3")?.textContent?.trim() ?? "";
    if (h3) by = wrap(ctx, h3, x + 16, by, colW - 32, 26, 2);
    const chart = el.querySelector<HTMLCanvasElement>(".st-chart canvas");
    if (chart && chart.width > 0) {
      const h = Math.min(380, (chart.height / chart.width) * (colW - 32));
      try { ctx.drawImage(chart, x + 16, by + 4, colW - 32, h); } catch { /* a chart that cannot be copied */ }
      by += h + 12;
    } else if (el.querySelector(".st-map")) {
      ctx.fillStyle = text2; ctx.font = `italic 400 17px ${font}`;
      by = wrap(ctx, "Map: open the screen in District IQ to see it (map tiles cannot be copied into a picture).", x + 16, by + 4, colW - 32, 24, 3);
    } else {
      ctx.fillStyle = text2; ctx.font = `400 17px ${font}`;
      const lines = (el.innerText || "").split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => l !== h3).slice(0, 18);
      for (const l of lines) { by = wrap(ctx, l, x + 16, by + 2, colW - 32, 23, 2); if (by - top > 500) break; }
    }
    by += 14;
    ctx.strokeRect(x, top, colW, by - top);
    colY[col] = by + 20;
  }
  y = Math.max(...colY) + 10;
  ctx.fillStyle = text2; ctx.font = `400 16px ${font}`;
  wrap(ctx, `Sources: ${doc.sources.join(", ")}. Data as of ${when(doc.asOf)}. Every figure comes from the console's data.`, pad, y, W - pad * 2, 22, 3);
  // trim the unused height
  const out = document.createElement("canvas");
  out.width = W; out.height = Math.min(canvas.height, y + 60);
  out.getContext("2d")?.drawImage(canvas, 0, 0);
  colY = [];
  await new Promise<void>((res) => out.toBlob((b) => { if (b) download(b, `${fileName(doc.title)}.png`); res(); }, "image/png"));
}
