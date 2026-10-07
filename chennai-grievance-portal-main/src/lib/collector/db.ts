import mysql, { Pool } from "mysql2/promise";
import { connectionSettings } from "@/lib/db";
import { awsPool } from "@/lib/aws/store";

declare global {
  // eslint-disable-next-line no-var
  var __intelPool: Pool | undefined;
}

/**
 * The district intelligence store lives next to the portal database on the same
 * server: `district_intel` is rebuilt by the pipeline (read-only here) and
 * `district_intel_ops` holds what the Collector does (written here, never by the
 * pipeline's export). Names are configurable for hosted deployments.
 */
function dbName(value: string | undefined, fallback: string): string {
  const name = value || fallback;
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Invalid database name: ${name}`);
  return name;
}

export const INTEL_DB = dbName(process.env.INTEL_DB_NAME, "district_intel");
export const OPS_DB = dbName(process.env.INTEL_OPS_DB_NAME, "district_intel_ops");

function createPool(): Pool {
  return mysql.createPool({
    ...connectionSettings(),
    database: INTEL_DB,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    // DATETIME values are IST wall-clock; keep them as strings so no timezone shifts them.
    dateStrings: true,
    decimalNumbers: true
  });
}

// DATA_BACKEND=aws: no MySQL server; the store is the district_intel build from S3, held in memory (lib/aws/store.ts)
const intelPool: Pool =
  global.__intelPool || (process.env.DATA_BACKEND === "aws" ? (awsPool() as Pool) : createPool());
if (process.env.NODE_ENV !== "production") {
  global.__intelPool = intelPool;
}

export default intelPool;

/**
 * An incident's title for display: on the AWS store, the readable headline taken from its own reports
 * (lib/collector/derive.ts), else the pipeline's "<category> – <place>" title. `i` is the incidents alias.
 */
export const TITLE = process.env.DATA_BACKEND === "aws" ? "COALESCE(i.headline, i.title)" : "i.title";

/** Fully qualified ops table, e.g. ops("collector_decisions") -> `district_intel_ops`.`collector_decisions` */
export function ops(table: string): string {
  return `\`${OPS_DB}\`.\`${table}\``;
}

/**
 * The group an incident belongs to: incidents that are the same problem in the same area share it on the AWS store
 * (lib/collector/cluster.ts, set when a build loads); elsewhere every incident is its own group. `i` is the incidents alias.
 */
export const CLUSTER = process.env.DATA_BACKEND === "aws" ? "COALESCE(i.cluster_id, i.incident_id)" : "i.incident_id";
