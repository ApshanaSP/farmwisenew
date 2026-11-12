import { upload, file, base, track, mob, repeats, call, P, j } from "./h.mjs";
const out = {};
const m = mob();
const a = await upload(); out.a = a;
// validation probes on the same petition (none should file)
out.zwName = await file(a.id, base({ name: "​​​", mobile: m }));
out.tamilDigitsMobile = await file(a.id, base({ name: "முருகன்", mobile: "௯௮௪௦௦௧௨௩௪௫" }));
out.aadhaarMobile = await file(a.id, base({ name: "முருகன்", mobile: "234567891234" }));
out.zwProblem = await file(a.id, base({ name: "முருகன்", problem: "​​​​​​" , mobile: m}));
console.log(JSON.stringify(out, null, 0).slice(0, 3000));
