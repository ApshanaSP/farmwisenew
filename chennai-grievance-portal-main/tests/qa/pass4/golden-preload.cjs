// QA pass 4, golden master: loaded into the test server through NODE_OPTIONS=--require (with freeze-clock.cjs), so production code is untouched.
// It makes one recording repeatable on a shared machine. It does three things, and docs/qa/pass4/golden/NORMALISE.md lists why:
//   1. no outbound network: anything not on this machine is refused at once, and the host is written to GOLDEN_NET_LOG
//   2. the files in data/aws-cache that outside feeds and other servers rewrite are read from, and written to, GOLDEN_CACHE_DIR
//   3. the embedding model stays off, so answers never depend on how far a background load has got
//   4. a new row's time stamp follows the frozen clock (SQLite's datetime('now') in a column default reads the real one)
//   5. only the pinned snapshot's table files can be seen in data/aws-cache: rehearsal/realdata.ts takes the first file that starts with a table's name, and other agents leave copies there
const dir = process.env.GOLDEN_CACHE_DIR;
if (!dir) return;

const dns = require("node:dns");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const sqlite = require("node:sqlite");
const threads = require("node:worker_threads");

const LOCAL = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const seen = new Set();
function refused(host) {
  if (seen.has(host)) return;
  seen.add(host);
  try { if (process.env.GOLDEN_NET_LOG) fs.appendFileSync(process.env.GOLDEN_NET_LOG, `${host}\n`); } catch { /* the log is only a note */ }
}

// ---- 1. network: fetch, plain sockets (SMTP, http, https) and name lookups
const realFetch = globalThis.fetch;
globalThis.fetch = function goldenFetch(input, init) {
  let host = "";
  try { host = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url).hostname; } catch { /* a relative or bad address: let fetch say so */ }
  if (host && !LOCAL.has(host)) { refused(host); return Promise.reject(new TypeError("fetch failed")); }
  return realFetch(input, init);
};

const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function goldenConnect(...args) {
  const a = args[0];
  const o = Array.isArray(a) ? a[0] : a;
  const host = o && typeof o === "object" ? (o.path ? null : o.host ?? "localhost") : typeof args[1] === "string" ? args[1] : typeof o === "string" ? null : "localhost";
  if (host && !LOCAL.has(host)) {
    refused(host);
    process.nextTick(() => this.destroy(Object.assign(new Error(`connect ECONNREFUSED ${host}`), { code: "ECONNREFUSED" })));
    return this;
  }
  return realConnect.apply(this, args);
};

const notFound = (host) => Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND", hostname: host });
const realLookup = dns.lookup;
dns.lookup = function goldenLookup(host, ...rest) {
  if (host && !LOCAL.has(host)) { refused(host); const cb = rest[rest.length - 1]; return void process.nextTick(() => cb(notFound(host))); }
  return realLookup.call(dns, host, ...rest);
};
const realPromiseLookup = dns.promises.lookup;
dns.promises.lookup = function goldenPromiseLookup(host, ...rest) {
  if (host && !LOCAL.has(host)) { refused(host); return Promise.reject(notFound(host)); }
  return realPromiseLookup.call(dns.promises, host, ...rest);
};

// ---- 2. the files feeds and other servers rewrite: one private copy per server
const CACHE = path.join(process.cwd(), "data", "aws-cache");
const FILES = (process.env.GOLDEN_CACHE_FILES || "").split(",").filter(Boolean);
const map = new Map();
for (const f of FILES) for (const tail of ["", ".tmp"]) map.set(path.join(CACHE, f + tail), path.join(dir, f + tail));
const to = (p) => (typeof p === "string" ? map.get(p) ?? p : p);
for (const name of ["readFileSync", "writeFileSync", "appendFile", "appendFileSync", "statSync"]) {
  const real = fs[name];
  fs[name] = function goldenFs(p, ...rest) { return real.call(fs, to(p), ...rest); };
}
const realRename = fs.renameSync;
fs.renameSync = function goldenRename(a, b) { return realRename.call(fs, to(a), to(b)); };

// ---- 5. table files: only the pinned ones
const manifest = JSON.parse(fs.readFileSync(path.join(CACHE, "qa", "pinned", "manifest.json"), "utf8"));
const pinnedTables = new Set(Object.entries(manifest.tables).map(([name, t]) => `${name}-${t.sha}.json.gz`));
const realReaddir = fs.readdirSync;
fs.readdirSync = function goldenReaddir(p, ...rest) {
  const list = realReaddir.call(fs, p, ...rest);
  if (p !== CACHE || rest.length) return list;
  return list.filter((f) => typeof f !== "string" || !f.endsWith(".json.gz") || pinnedTables.has(f));
};

// ---- 3. the embedding model: the store's own switch (a built search index means "no embedding here", embed.ts warmUp) and no worker
const INDEX_MARK = path.join(process.cwd(), "data", "lancedb", "incidents.lance");
const realExists = fs.existsSync;
fs.existsSync = function goldenExists(p) { return p === INDEX_MARK ? true : realExists.call(fs, to(p)); };
const RealWorker = threads.Worker;
threads.Worker = class GoldenWorker extends RealWorker {
  constructor(file, ...rest) {
    if (String(file).endsWith("embed-worker.mjs")) throw new Error("the embedding model is off in the golden master");
    super(file, ...rest);
  }
};
// The search index (LanceDB) answers "no index yet", as a site with none does, and Ask District IQ then uses its keyword search. data/lancedb is shared by every
// server of this worktree and is native code, so a table another agent's run leaves there would otherwise decide the answers: with the model off, each search on it fails.
const LANCE_OFF = "golden:lance-off";
require("node:module").registerHooks({
  resolve(specifier, context, next) {
    return specifier === "@lancedb/lancedb" ? { url: LANCE_OFF, format: "commonjs", shortCircuit: true } : next(specifier, context);
  },
  load(url, context, next) {
    return url === LANCE_OFF ? { format: "commonjs", source: "module.exports = { connect: async () => ({ tableNames: async () => [] }) };", shortCircuit: true } : next(url, context);
  }
});

// ---- 4. column defaults: every "created_at" in the store is DEFAULT (datetime('now', '+330 minutes')), which SQLite works out from the real clock
const frozen = Date.parse(process.env.QA_FROZEN_NOW || "");
if (!Number.isNaN(frozen)) {
  const ist = new Date(frozen + 330 * 60_000).toISOString().slice(0, 19).replace("T", " ");
  const realExec = sqlite.DatabaseSync.prototype.exec;
  sqlite.DatabaseSync.prototype.exec = function goldenExec(sql) {
    return realExec.call(this, String(sql).replace(/datetime\('now',\s*'\+330 minutes'\)/gi, `'${ist}'`));
  };
}
