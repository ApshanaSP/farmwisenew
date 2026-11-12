import { upload, file, base, track, mob, repeats, call, P, j } from "./h.mjs";
const out = {};
const m = mob();
// A: Tamil petition, Metrowater, ward 70
const nameNFC = "செல்வி ராமசாமி";
const A = await upload();
out.A = await file(A.id, base({ name: nameNFC, mobile: m, street: "ஜவஹர் தெரு", area: "பெரம்பூர்", problem: "கழிவுநீர் தெருவில் ஓடுகிறது, துர்நாற்றம்", dept: "CMWSSB", ward: 70 }));
const codeA = out.A.body.approved?.code;
out.trackA = await track(codeA, m.slice(-4));
out.trackA_tamilDigits = await track(codeA, [...m.slice(-4)].map((d) => String.fromCharCode(0x0BE6 + Number(d))).join(""));
// B: same person, NFD + zero width name, Tanglish problem, no mobile
const B = await upload();
const nameNFD = nameNFC.normalize("NFD").replace("ராம", "ரா‌ம");
const cB = { mobile: "", name: nameNFD, street: "Jawahar Street", ward: 70, dept: "CMWSSB", problem: "kazhivu neer theruvil odudhu, smell romba" };
out.repB = await repeats(B.id, cB);
const cB2 = { ...cB, mobile: m };
out.repB_withMobile = await repeats(B.id, cB2);
// C: same mobile, same problem in Tamil, different words
out.repC_tamil = await repeats(B.id, { ...cB2, name: nameNFC, problem: "கழிவுநீர் அடைப்பு, துர்நாற்றம் வீசுகிறது" });
console.log(JSON.stringify({ codeA, ...out }, null, 0).slice(0, 5000));
