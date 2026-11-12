// officer-day p11: is there any request-size limit before the report route reads the whole form? ONE request of 30 MB (one file),
// which the route must refuse ("5 MB or smaller"); the timing shows whether it read the whole body first. Not repeated.
import { as, log, form, JPEG } from "./h.mjs";
const inc = process.argv[2];
const mb = Number(process.argv[3] ?? 30);
const big = Buffer.concat([JPEG, Buffer.alloc(mb * 1024 * 1024)]);
const t0 = Date.now();
const r = await as("officerA", "POST", `/api/officer/grievances/${inc}/report`, { body: form({ remarks: "size probe", step: "close" }, [big]), raw: true });
log("p11", { mb, status: r.status, ms: Date.now() - t0, body: r.text.slice(0, 200) });
