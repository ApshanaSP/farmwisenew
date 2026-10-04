/**
 * Builds (or brings up to date) Ask District IQ's search index in data/lancedb: the incidents and news collections,
 * each record with its multilingual-e5 vector and a keyword index. Only new or changed records are embedded; incident
 * vectors from the older index are reused. Runs in its own process so the web server never stalls:
 *     npm run lance:build
 * Reads the same store as the website (MySQL, or the team's AWS build when DATA_BACKEND=aws).
 */
const path = require("path");
const os = require("os");

const root = path.join(__dirname, "..");
process.chdir(root);
require("dotenv").config({ path: path.join(root, ".env") });
// AWS mode: a durable file of this job's own (the running website holds the shared one open); never saves to AWS
process.env.AWS_DURABLE_FILE ??= path.join(root, "data", "aws-cache", "durable.lance-build.sqlite");
delete process.env.AWS_STORE_SAVE;
const jiti = require("jiti")(__filename, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const { useThreads } = jiti(path.join(root, "src", "lib", "assistant", "embed.ts"));
const { syncLance } = jiti(path.join(root, "src", "lib", "assistant", "lance.ts"));

const threads = Math.max(2, os.cpus().length - 2);
useThreads(threads);
const t0 = Date.now();
console.log(`[lance:build] ${new Date().toISOString()} starting on ${threads} threads`);
import(require("url").pathToFileURL(path.join(root, "node_modules", "@huggingface", "transformers", "dist", "transformers.node.mjs")).href)
  .then((tf) => { globalThis.__transformers = tf; })
  .then(() => syncLance({ batch: 32, log: (m) => console.log(`[lance:build] ${m}`) }))
  .then((reports) => {
    for (const r of reports)
      console.log(`[lance:build] ${r.kind}: ${r.total} records, ${r.embedded} embedded, ${r.reused} reused, ${r.rewritten} rewritten, ${r.removed} removed (${Math.round(r.ms / 1000)} s)`);
    console.log(`[lance:build] done in ${Math.round((Date.now() - t0) / 1000)} s`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(`[lance:build] failed: ${e && e.stack ? e.stack : e}`);
    process.exit(1);
  });
