import fs from "fs";
import mysql, { Pool, PoolConnection } from "mysql2/promise";
import { awsPool } from "@/lib/aws/store";

declare global {
  // eslint-disable-next-line no-var
  var __mysqlPool: Pool | undefined;
}

/**
 * TLS for a URL connection. The server's certificate is checked (an unchecked one lets anyone on the path read the
 * traffic); DB_SSL_CA (the provider's CA certificate, as PEM text or a file path) for a provider's own CA, and
 * DB_SSL_INSECURE=true turns the check off only when someone opts in. ?ssl=false in the URL: no TLS.
 */
export function tlsFor(u: URL): { rejectUnauthorized: boolean; ca?: string } | undefined {
  if (u.searchParams.get("ssl") === "false") return undefined;
  if (process.env.DB_SSL_INSECURE === "true") return { rejectUnauthorized: false };
  const ca = process.env.DB_SSL_CA?.trim();
  if (!ca) return { rejectUnauthorized: true };
  return { rejectUnauthorized: true, ca: ca.includes("BEGIN CERTIFICATE") ? ca : fs.readFileSync(ca, "utf8") };
}

/**
 * Connection settings from either discrete DB_* vars or a connection URL.
 * Managed hosts (Railway, Aiven, PlanetScale, ...) provide a URL, so accepting
 * both lets the same build run locally and in production.
 */
export function connectionSettings() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ""),
      // Managed MySQL generally requires TLS.
      ssl: tlsFor(u)
    };
  }
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "district_collector_dashboard",
    ssl: undefined
  };
}

function createPool(): Pool {
  return mysql.createPool({
    ...connectionSettings(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
  });
}

// Reuse the pool across hot-reloads in dev and across route invocations.
// DATA_BACKEND=aws: no MySQL server; the portal's tables live in the AWS durable store (lib/aws/store.ts)
const pool: Pool = global.__mysqlPool || (process.env.DATA_BACKEND === "aws" ? (awsPool() as Pool) : createPool());
if (process.env.NODE_ENV !== "production") {
  global.__mysqlPool = pool;
}

export default pool;

/** Run a set of queries inside a transaction. */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
