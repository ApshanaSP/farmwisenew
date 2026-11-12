// hunt-citizen probe: real-route probes against a running server. node tests/qa/pass4/hunt-citizen.probe.mjs [port]
import { login, req } from "./lib/access-lib.mjs";
const port = process.argv[2] || 3175, base = `http://127.0.0.1:${port}`;
const J = { "content-type": "application/json" };
const out = {};
const rec = (k, v) => { out[k] = v; console.log(k, JSON.stringify(v).slice(0, 400)); };
const reg = (b) => req(base, "POST", "/api/auth/register", { headers: J, body: JSON.stringify(b) });
const t = Date.now();
const pw = "Zx9!qwerty12";
// register variants
rec("reg-ok", await reg({ email: `a${t}@example.com`, password: pw, confirmPassword: pw, firstName: "முத்து", lastName: "குமார்" }));
rec("reg-case-dup", await reg({ email: `A${t}@Example.com`, password: pw, confirmPassword: pw, firstName: "x" }));
rec("reg-mismatch", await reg({ email: `b${t}@example.com`, password: pw, confirmPassword: pw + "1", firstName: "x" }));
rec("reg-space-email", await reg({ email: ` c${t}@example.com `, password: pw, confirmPassword: pw, firstName: "x" }));
rec("reg-ws-name", await reg({ email: `d${t}@example.com`, password: pw, confirmPassword: pw, firstName: "   " }));
// login with different case as registered
const lg = (email, password) => req(base, "POST", "/api/auth/login", { headers: J, body: JSON.stringify({ email, password }) });
rec("login-upper", await lg(`A${t}@EXAMPLE.com`, pw));
rec("login-lower", await lg(`a${t}@example.com`, pw));
rec("login-spaced", await lg(` c${t}@example.com `, pw));
// reset flow
const fp = (p, b) => req(base, "POST", "/api/auth/forgot-password/" + p, { headers: J, body: JSON.stringify(b) });
const r1 = await fp("request-otp", { email: `a${t}@example.com` });
rec("otp-req", r1);
rec("otp-req-nouser", await fp("request-otp", { email: `zz${t}@example.com` }));
rec("otp-bad", await fp("verify-otp", { email: `a${t}@example.com`, otp: "000000" }));
rec("otp-bad-2", await fp("reset-password", { email: `a${t}@example.com`, otp: "000000", password: pw, confirmPassword: pw }));
// citizen A
const A = await login(base, "citizenA");
rec("citizenA-login", A.status);
const me = await req(base, "GET", "/api/auth/me", { cookie: A.cookie });
rec("me", me);
// complaints list/track
rec("track-bad", await req(base, "GET", "/api/complaints/NOPE", { cookie: A.cookie }));
rec("track-sqli", await req(base, "GET", "/api/complaints/" + encodeURIComponent("' OR 1=1 --"), { cookie: A.cookie }));
rec("list", await req(base, "GET", "/api/complaints", { cookie: A.cookie }));
// media upload
const fd = new FormData(); fd.append("file", new Blob([Buffer.from("not an image")], { type: "image/png" }), "x.png");
rec("media-fake-png", await req(base, "POST", "/api/complaints/media", { cookie: A.cookie, body: fd }));
const fd2 = new FormData(); fd2.append("file", new Blob([Buffer.from("<svg onload=alert(1)>")], { type: "image/svg+xml" }), "x.svg");
rec("media-svg", await req(base, "POST", "/api/complaints/media", { cookie: A.cookie, body: fd2 }));
// studio
const C = await login(base, "collector");
const up = async (name, buf, type = "text/csv") => { const f = new FormData(); f.append("file", new Blob([buf], { type }), name); const r = await req(base, "POST", "/api/collector/studio", { cookie: C.cookie, body: f, timeout: 90000 }); return { status: r.status, tail: r.text.slice(-500) }; };
const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
const ta = "வார்டு,புகார்,தேதி\n12,குடிநீர் பிரச்சனை,2027-03-01\n13,சாலை சேதம்,2026-11-05\n14,குப்பை,2030-01-01\n";
rec("studio-tamil-bom", await up("tamil-bom.csv", Buffer.concat([bom, Buffer.from(ta, "utf8")])));
rec("studio-tamil-utf16", await up("tamil16.csv", Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(ta, "utf16le")])));
rec("studio-empty", await up("empty.csv", Buffer.alloc(0)));
rec("studio-headeronly", await up("h.csv", Buffer.from("ward,complaint,date\n")));
rec("studio-future", await up("future.csv", Buffer.from("ward,complaints,date\n1,5,2027-01-01\n2,7,2027-01-02\n3,9,2027-01-03\n")));
rec("studio-semicolon", await up("semi.csv", Buffer.from("ward;complaints;date\n1;5;01/02/2026\n2;7;02/02/2026\n")));
rec("studio-link-local", await (async()=>{const r=await req(base,"POST","/api/collector/studio",{cookie:C.cookie,headers:J,body:JSON.stringify({url:"http://127.0.0.1:"+port+"/api/auth/me"}),timeout:60000});return {status:r.status,tail:r.text.slice(-300)}})());
rec("studio-list", await req(base, "GET", "/api/collector/studio", { cookie: C.cookie }).then(r=>({status:r.status,text:r.text.slice(0,1500)})));
import fs from "node:fs"; fs.mkdirSync("../docs/qa/pass4/evidence", { recursive: true });
fs.writeFileSync("../docs/qa/pass4/evidence/hunt-citizen.probe.json", JSON.stringify(out, null, 1));
