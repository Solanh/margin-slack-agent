import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool, QueryResultRow } from "pg";

interface MigrationRow extends QueryResultRow {
  name: string;
}

export interface MigrationStatus {
  expected: string[];
  applied: string[];
  pending: string[];
  unexpected: string[];
  current: boolean;
}

export async function getMigrationStatus(
  database: Pick<Pool, "query">,
  migrationsDirectory = resolve(process.cwd(), "migrations"),
): Promise<MigrationStatus> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const expected = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  let applied: string[] = [];
  try {
    const result = await database.query<MigrationRow>(
      "SELECT name FROM schema_migrations ORDER BY name ASC",
    );
    applied = result.rows.map((row) => row.name);
  } catch (error) {
    if (!isUndefinedTableError(error)) {
      throw error;
    }
  }

  const expectedSet = new Set(expected);
  const appliedSet = new Set(applied);
  const pending = expected.filter((name) => !appliedSet.has(name));
  const unexpected = applied.filter((name) => !expectedSet.has(name));

  return {
    expected,
    applied,
    pending,
    unexpected,
    current: pending.length === 0 && unexpected.length === 0,
  };
}

function isUndefinedTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "42P01"
  );
}
