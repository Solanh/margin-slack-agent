import { Pool } from "pg";

export function createPostgresPool(databaseUrl: string): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  pool.on("error", (error) => {
    // Never include query parameters or note contents in this log path.
    console.error("Unexpected PostgreSQL pool error", error);
  });

  return pool;
}
