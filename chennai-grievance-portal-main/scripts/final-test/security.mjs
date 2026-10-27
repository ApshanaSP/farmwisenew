// FINAL TEST security probe without a session (L3 subset): path traversal, dev pages in production, security headers,
// wrong methods, malformed bodies, sign-in throttling. Uses a FINALTEST e-mail that does not exist; changes no data.
//   node scripts/final-test/security.mjs   (BASE defaults to http://localhost:3005)
const BASE = (process.env.BASE || "http://localhost:3005").replace(/\/$/, "");
let fail = 0;
const line = (ok, what) => { if (!ok) fail++; console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
const req = async (path, init = {}) => {
  const r = await fetch(BASE + path, { redirect: "manual", ...init });
  return { status: r.status, headers: r.headers, body: await r.text() };
};
const leak = (b) => /at \w+ \(|node_modules|\bSELECT\b.+\bFROM\b|sqlite|ENOENT|[A-Z]:\\\\/i.test(b);

for (const p of ["/api/complaints/media/..%2F..%2F.env", "/api/complaints/media/..%5C..%5C.env", "/api/complaints/media/%2e%2e%2fpackage.json",
  "/api/officer/photos/..%2F..%2F/.env", "/api/officer/photos/x/..%2F..%2F..%2Fpackage.json", "/api/complaints/media/C:%5CWindows%5Cwin.ini"]) {
  const r = await req(p);
  line(r.status >= 400 && r.status < 500 && !/REFRESH_API_KEY|"dependencies"|\[fonts\]/.test(r.body), `traversal refused: ${p} -> ${r.status}`);
  line(!leak(r.body), `no stack or path in: ${p}`);
}

for (const p of ["/dev/assistant", "/dev/ui"]) {
  const r = await req(p);
  line(r.status === 404 || (r.status >= 300 && r.status < 400 && !/\/dev\//.test(r.headers.get("location") || "")), `dev page blocked in production: ${p} -> ${r.status}`);
}

for (const p of ["/login", "/api/auth/me"]) {
  const r = await req(p);
  const h = (k) => r.headers.get(k) || "";
  line(/nosniff/i.test(h("x-content-type-options")), `${p}: X-Content-Type-Options nosniff`);
  line(!!h("x-frame-options") || /frame-ancestors/i.test(h("content-security-policy")), `${p}: framing restricted`);
  line(!!h("referrer-policy"), `${p}: Referrer-Policy`);
  line(!/x-powered-by/i.test([...r.headers.keys()].join(",")), `${p}: no X-Powered-By`);
}

for (const [m, p] of [["DELETE", "/api/collector/overview"], ["PUT", "/api/auth/login"], ["GET", "/api/auth/login"]]) {
  const r = await req(p, { method: m });
  line(r.status === 405 || r.status === 401 || r.status === 404, `wrong method ${m} ${p} -> ${r.status}`);
}

for (const body of ["", "{", "null", JSON.stringify({ email: "x".repeat(10000), password: "y" }), JSON.stringify({ email: ["a"], password: { $ne: 1 } }),
  JSON.stringify({ email: "' OR 1=1 --", password: "x" })]) {
  const r = await req("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body });
  line(r.status >= 400 && r.status < 500, `bad sign-in body -> ${r.status} (${body.slice(0, 30) || "empty"})`);
  line(!leak(r.body), `no stack in the sign-in refusal (${body.slice(0, 20) || "empty"})`);
}

let throttled = false;
for (let k = 0; k < 12 && !throttled; k++) {
  const r = await req("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "finaltest-nobody@example.invalid", password: `wrong-${k}` }) });
  if (r.status === 429) throttled = true;
}
line(throttled, "repeated failed sign-ins are throttled (429 within 12 tries)");

console.log(fail ? `FAIL (${fail})` : "PASS");
process.exit(fail ? 1 : 0);
