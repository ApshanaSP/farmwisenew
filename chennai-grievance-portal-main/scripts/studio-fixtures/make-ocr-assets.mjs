/**
 * The OCR fixtures: a photo-like image of a printed table (PNG and JPEG), drawn by a real browser from an HTML table,
 * so the Studio's OCR is tested on pixels, not on text. Run once; the images are committed.
 *
 *   node scripts/studio-fixtures/make-ocr-assets.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "assets");
fs.mkdirSync(out, { recursive: true });

const zones = ["Adyar", "Teynampet", "Royapuram", "Ambattur", "Perungudi", "Kodambakkam", "Alandur", "Manali", "Madhavaram", "Tondiarpet", "Anna Nagar", "Sholinganallur"];
const rows = zones.map((z, i) => [z, String(10 + i * 7), String(120 + i * 13), String(3 + (i * 5) % 11)]);
const html = `<!doctype html><html><body style="margin:0;background:#fff;font:22px Arial,sans-serif;color:#000">
<div style="padding:30px;width:900px">
<p style="font-weight:bold;margin:0 0 16px">Greater Chennai Corporation - Fever survey by zone, October 2026</p>
<table style="border-collapse:collapse;width:100%">
<tr>${["Zone", "Ward", "Households", "Fever cases"].map((h) => `<th style="border:1px solid #000;padding:8px 12px;text-align:left">${h}</th>`).join("")}</tr>
${rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #000;padding:8px 12px">${c}</td>`).join("")}</tr>`).join("\n")}
</table></div></body></html>`;

const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch({ channel: "chrome" }));
const page = await browser.newPage({ viewport: { width: 960, height: 760 } });
await page.setContent(html);
const box = await page.locator("div").first().boundingBox();
await page.screenshot({ path: path.join(out, "table.png"), clip: box });
await page.screenshot({ path: path.join(out, "table.jpg"), clip: box, type: "jpeg", quality: 85 });
await browser.close();
fs.writeFileSync(path.join(out, "table.expected.json"), JSON.stringify({ headers: ["Zone", "Ward", "Households", "Fever cases"], rows }, null, 1));
console.log("wrote", fs.readdirSync(out).join(", "));
