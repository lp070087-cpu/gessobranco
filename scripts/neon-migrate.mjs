import { neon } from "@neondatabase/serverless";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { sqlStatements } from "./sql-statements.mjs";

const directory = new URL("../drizzle/", import.meta.url);
const files = (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
const migrations = await Promise.all(
  files.map(async (name) => {
    const source = await readFile(new URL(name, directory), "utf8");
    return {
      name,
      checksum: createHash("sha256").update(source).digest("hex"),
      statements: sqlStatements(source),
    };
  }),
);
if (process.argv.includes("--plan")) {
  for (const migration of migrations)
    console.log(migration.name, migration.statements.length, "instruções SQL");
} else {
  if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL no ambiente do servidor.");
  const sql = neon(process.env.DATABASE_URL);
  await sql.query("CREATE SCHEMA IF NOT EXISTS preciso");
  await sql.query(
    "CREATE TABLE IF NOT EXISTS preciso.schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const migration of migrations) {
    const previous = await sql.query(
      "SELECT checksum FROM preciso.schema_migrations WHERE name=$1",
      [migration.name],
    );
    if (previous.length) {
      if (previous[0].checksum !== migration.checksum)
        throw new Error(`Migration já aplicada foi alterada: ${migration.name}`);
      console.log(migration.name, "já aplicada");
      continue;
    }
    // DDL and its checkpoint are atomic. A concurrent duplicate rolls back its transaction.
    await sql.transaction([
      ...migration.statements.map((statement) => sql.query(statement)),
      sql.query("INSERT INTO preciso.schema_migrations(name,checksum) VALUES($1,$2)", [
        migration.name,
        migration.checksum,
      ]),
    ]);
    console.log(migration.name, "aplicada");
  }
}
