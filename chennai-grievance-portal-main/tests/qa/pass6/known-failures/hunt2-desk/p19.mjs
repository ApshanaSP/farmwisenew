import { upload, file, base, mob, repeats } from "./h.mjs";
const out = {};
const prob = "Stray dogs biting children near the school gate";
for (const [name, street] of [["R. Kumar", "Kamaraj Salai"], ["R Kumar", "Nehru Street"]]) {
  const A = await upload();
  out[name] = (await file(A.id, base({ name, mobile: mob(), street, area: "Kolathur", ward: 64, problem: prob, dept: "GCC-HLT" }))).body.approved?.code;
}
const C = await upload();
out.rep = (await repeats(C.id, { mobile: mob(), name: "Meenakshi", street: "Gandhi Street", ward: 64, dept: "GCC-HLT", problem: "Stray dogs biting children near school" })).body.repeats;
console.log(JSON.stringify(out).slice(0, 1500));
