/**
 * Tiny Markdown renderer for saved briefings and assistant answers (headings, lists, bold, code, italics); input is escaped
 * first. _italics_ only between word boundaries, so zone_no or is_open stay as written.
 */
export function mdToHtml(md: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/(^|[^\p{L}\p{N}_])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}_])/gu, "$1<i>$2</i>");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  // 26 Nov: a table (| a | b |, its rule line, its rows), as the brain's answers carry (lib/brain/render.ts mdTable)
  let table: string[][] | null = null;
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const closeTable = () => {
    if (!table) return;
    const [head = [], ...rows] = table;
    const num = head.map((_, k) => rows.length > 0 && rows.every((r) => /^[-–—]?$|^-?[\d,.]+%?$/.test(r[k] ?? "")));
    out.push(`<div class="md-tablewrap"><table class="md-table"><thead><tr>${head.map((c, k) => `<th${num[k] ? ' class="num"' : ""}>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td${num[k] ? ' class="num"' : ""}>${inline(r[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    table = null;
  };
  for (const line of md.split("\n")) {
    if (/^\s*\|.*\|\s*$/.test(line)) { close(); if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) { table ??= []; continue; } (table ??= []).push(cells(line)); continue; }
    closeTable();
    const h = line.match(/^(#{1,3})\s+(.*)/), ul = line.match(/^\s*-\s+(.*)/), ol = line.match(/^\s*\d+\.\s+(.*)/);
    if (h) { close(); out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`); }
    else if (ul) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(ul[1])}</li>`); }
    else if (ol) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(ol[1])}</li>`); }
    else if (line.trim()) { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  close();
  closeTable();
  return out.join("");
}
