import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

//The database lives on disk (default: ./data/ticketing.sqlite) so data survives a server restart

const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data", "ticketing.sqlite");

export function resolveDbPath(dbPath) {
  return dbPath || process.env.TICKETING_DB_PATH || DEFAULT_DB_PATH;
}

export function openDatabase(dbPath) {
  const target = resolveDbPath(dbPath);

  // Ensure the directory exists so a fresh file-based DB can be created.
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(target);

  db.exec("PRAGMA foreign_keys = ON");

  return db;
}

// Apply schema.sql against an open database. Idempotent (uses IF NOT EXISTS).

export function applySchema(db, schemaSql) {

  const cleaned = schemaSql
    .split("\n")
    .map((line) => {
      const commentIdx = line.indexOf("--");
      return commentIdx === -1 ? line : line.slice(0, commentIdx);
    })
    .join("\n");

  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    db.exec(statement);
  }
}

//Open the default database and apply the schema. Convenience entry point used by the repository and the seed script.
export function createConnection(dbPath) {
  const db = openDatabase(dbPath);
  return db;
}

export { DEFAULT_DB_PATH };