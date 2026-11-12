import { upload, file, base, track, mob, repeats, call, P, j } from "./h.mjs";
const out = {};
// the petitioner wrote 098400 12345 (trunk 0); the desk box keeps 10 characters, so 0984001234 is typed
const A = await upload();
out.zeroMobile = await file(A.id, base({ name: "Zero Lead", mobile: "0984001234", problem: "Street light not burning for a month", dept: "GCC-ELE" }));
const code = out.zeroMobile.body.approved?.code;
out.trackRealLast4 = await track(code, "2345");
out.trackStoredLast4 = await track(code, "1234");
// aadhaar typed whole in the subject with Tamil digits and in the door box
const B = await upload();
out.aadhaarFields = await file(B.id, base({ name: "Aadhaar Test", mobile: mob(), door: "2345 6789 1234", subject: "ஆதார் ௨௩௪௫ ௬௭௮௯ ௧௨௩௪", problem: "Drinking water not coming, Aadhaar 2345-6789-1234", dept: "CMWSSB" }));
console.log(JSON.stringify({ code, ...out }).slice(0, 3000));
