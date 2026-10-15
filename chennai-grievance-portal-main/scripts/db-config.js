/**
 * Single source of truth for database connection settings, shared by every
 * script and mirrored by src/lib/db.ts.
 *
 * Accepts either form:
 *   - discrete vars: DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
 *   - a URL:         DATABASE_URL or MYSQL_URL
 *                    (mysql://user:pass@host:port/dbname)
 *
 * Managed hosts (Railway, Aiven, PlanetScale, ...) hand you a URL, so
 * supporting both means the same code runs locally and in production without
 * a second config path.
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function fromUrl(raw) {
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    // Managed MySQL almost always requires TLS; same rules as tlsFor() in src/lib/db.ts
    ssl: tlsFor(u)
  };
}

/** The server certificate is checked; DB_SSL_CA adds the provider's CA, DB_SSL_INSECURE=true opts out. */
function tlsFor(u) {
  if (u.searchParams.get("ssl") === "false") return undefined;
  if (process.env.DB_SSL_INSECURE === "true") return { rejectUnauthorized: false };
  const ca = (process.env.DB_SSL_CA || "").trim();
  if (!ca) return { rejectUnauthorized: true };
  return { rejectUnauthorized: true, ca: ca.includes("BEGIN CERTIFICATE") ? ca : fs.readFileSync(ca, "utf8") };
}

function getDbConfig() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (url) return fromUrl(url);

  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "district_collector_dashboard"
  };
}

/** Host + database only — safe to print, never includes the password. */
function describeDb() {
  const c = getDbConfig();
  return `${c.user}@${c.host}:${c.port}/${c.database}`;
}

module.exports = { getDbConfig, describeDb };
