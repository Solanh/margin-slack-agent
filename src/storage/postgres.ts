import { Pool } from "pg";
import { describeError } from "../observability/safeLogger.js";

export function createPostgresPool(databaseUrl: string): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error", describeError(error));
  });

  return pool;
}
