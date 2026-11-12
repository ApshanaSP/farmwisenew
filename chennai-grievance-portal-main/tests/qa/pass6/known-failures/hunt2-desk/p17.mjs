import { call, P, j, upload, file, base, mob, track } from "./h.mjs";
const out = {};
const A = await upload();
const subj = "அ".repeat(249) + "😀" + " tail";
const big = "கழிவுநீர் தெருவில் ஓடுகிறது. ".repeat(1100).slice(0, 30000);
out.long = await file(A.id, base({ name: "Long Text", mobile: mob(), subject: subj, problem: "ஆ".repeat(398) + "😀", fullText: big, dept: "CMWSSB" }));
const code = out.long.body.approved?.code;
if (code) {
  await new Promise((r) => setTimeout(r, 1500));
  const c = await call(P, "collector", "GET", `/api/collector/incidents/INC-W-${code}`);
  const b = j(c);
  const t = b.incident?.title ?? "";
  out.caseTitleLen = t.length; out.caseTitleEnd = JSON.stringify(t.slice(-3));
  out.loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(c.text) || c.text.includes("\ud83d") || c.text.includes("�");
  const o = await call(P, "officerC", "GET", `/api/officer/grievances/INC-W-${code}`);
  out.officerStatus = o.status;
}
console.log(JSON.stringify(out).slice(0, 1500));
