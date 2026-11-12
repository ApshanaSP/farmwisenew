// hunt2-desk helpers: upload a petition and file it on the dry-run server (port 3106). Never prints a password, cookie or token.
import { call } from "../../lib/live.mjs";
export const P = 3106;
export const j = (r) => { try { return JSON.parse(r.text); } catch { return { raw: r.text.slice(0, 300) }; } };
export async function upload() {
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
  const fd = new FormData(); fd.append("pages", new Blob([jpg], { type: "image/jpeg" }), "petition.jpg");
  const up = await call(P, "manu", "POST", "/api/manu/petitions", { body: fd, raw: true });
  const id = j(up).id;
  for (let i = 0; i < 30; i++) { const d = j(await call(P, "manu", "GET", `/api/manu/petitions/${id}`)); if (d.status !== "reading") return { id, status: d.status }; await new Promise((r) => setTimeout(r, 1000)); }
  return { id, status: "reading" };
}
export const base = (o = {}) => ({ name: "QA Petitioner", mobile: "", door: "12", street: "Jawahar Street", area: "Perambur", pincode: "600011", ward: 70, date: "12.11.2026", subject: "",
  problem: "Sewage overflowing on the street", request: "Please clear the block", dept: "CMWSSB", urgent: false, fullText: "", attachTo: null, ...o });
export const file = async (id, fields) => { const r = await call(P, "manu", "POST", `/api/manu/petitions/${id}`, { body: { action: "file", fields } }); return { status: r.status, body: j(r) }; };
export const repeats = async (id, c) => { const r = await call(P, "manu", "POST", `/api/manu/petitions/${id}`, { body: { action: "repeats", ...c } }); return { status: r.status, body: j(r) }; };
export const track = async (code, last4, key) => { const r = await call(P, null, "POST", "/api/track", { body: { code, last4, key }, headers: { referer: "http://127.0.0.1:3106/track" } }); return { status: r.status, body: j(r) }; };
export const mob = () => "9" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
export { call };
