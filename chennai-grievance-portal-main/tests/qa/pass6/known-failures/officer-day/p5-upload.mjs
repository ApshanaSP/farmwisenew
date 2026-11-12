// officer-day p5: the completion report's checks (remarks, photo count, size, type, names). No grant is sent, so nothing is saved:
// a report that passes every check stops at the 428 "confirm it's you".
// usage: node p5-upload.mjs <incidentId>
import { as, log, form, JPEG } from "./h.mjs";

const inc = process.argv[2];
const officer = process.argv[3] ?? "officerA";
const post = async (tag, fd, extra = {}) => {
  const r = await as(officer, "POST", `/api/officer/grievances/${inc}/report`, { body: fd, raw: true, ...extra });
  log("p5", { tag, status: r.status, body: r.text.slice(0, 220) });
  return r;
};
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const big = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024 + 1 - JPEG.length)]);
const polyglot = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("<html><script>alert(1)</script></html>")]);

await post("no photos", form({ remarks: "Cleared the garbage.", step: "close" }, []));
await post("9 photos", form({ remarks: "Cleared the garbage.", step: "close" }, Array(9).fill(JPEG)));
await post("5MB+1", form({ remarks: "Cleared the garbage.", step: "close" }, [big]));
await post("text file", form({ remarks: "Cleared the garbage.", step: "close" }, [Buffer.from("hello, not an image")]));
await post("png named jpg", form({ remarks: "Cleared the garbage.", step: "close" }, [PNG]));
await post("polyglot jpeg/html", form({ remarks: "Cleared the garbage.", step: "close" }, [polyglot]));
await post("remarks 4", form({ remarks: "done", step: "close" }));
await post("remarks spaces", form({ remarks: "     ", step: "close" }));
await post("remarks 2001", form({ remarks: "x".repeat(2001), step: "close" }));
await post("remarks tamil 1500", form({ remarks: "குப்பை அகற்றப்பட்டது. ".repeat(68), step: "close" }));
await post("remarks emoji/html", form({ remarks: "<img src=x onerror=alert(1)> cleared 🧹", step: "close" }));
await post("photos as text field", (() => { const fd = new FormData(); fd.append("remarks", "Cleared the garbage."); fd.append("step", "close"); fd.append("photos", "not a file"); return fd; })());
await post("step=other", form({ remarks: "Cleared the garbage.", step: "verify" }));
await post("json body", JSON.stringify({ remarks: "x" }), { headers: { "content-type": "application/json" } });
// what the confirm box says
const r = await post("for grant", form({ remarks: "Cleared the garbage.", step: "close" }));
log("p5", { confirmSummary: r.json?.confirm?.summary, title: r.json?.confirm?.title });
