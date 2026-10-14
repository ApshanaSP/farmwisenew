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
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,3})\s+(.*)/), ul = line.match(/^\s*-\s+(.*)/), ol = line.match(/^\s*\d+\.\s+(.*)/);
    if (h) { close(); out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`); }
    else if (ul) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(ul[1])}</li>`); }
    else if (ol) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(ol[1])}</li>`); }
    else if (line.trim()) { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  close();
  return out.join("");
}
