/**
 * A file download that can answer "Confirm it's you": the export routes ask for it (a 428 the console's confirm box answers, then the
 * request is repeated with the grant), and a plain link cannot send the grant (QA4 gate, redteam-final-5). The file is fetched, then
 * handed to the browser as a download. Returns false when it did not come (not confirmed, refused, offline).
 */
export async function downloadFile(href: string, fallbackName = "district-iq-export"): Promise<boolean> {
  try {
    const r = await fetch(href);
    if (!r.ok) return false;
    const type = r.headers.get("content-type") ?? "";
    const ext = /html/i.test(type) ? ".html" : /pdf/i.test(type) ? ".pdf" : /spreadsheet|excel/i.test(type) ? ".xlsx" : /csv/i.test(type) ? ".csv" : "";
    const name = r.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `${fallbackName}${ext}`;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/** onClick for an <a href> that is an export: the link still names the file, and a click fetches it through the confirm step */
export const viaConfirm = (href: string) => (e: { preventDefault(): void }) => { e.preventDefault(); void downloadFile(href); };
