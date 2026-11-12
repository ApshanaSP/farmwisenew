import { call } from "../../lib/live.mjs";
import { snap } from "./snap.mjs";
for (const id of ["INC-W-2026-482UHM", "INC-W-2026-467UPC", "INC-W-2026-676SFQ"]) console.log(JSON.stringify(await snap(id, id)));
