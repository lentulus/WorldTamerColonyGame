import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', '..', '..', 'supporting', 'sql');

let db: DatabaseSync;

export function initColonyDb(path: string): void {
  db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  const schema = readFileSync(join(SQL_DIR, 'schema.sql'), 'utf8');
  db.exec(schema);

  const alreadySeeded = (db.prepare(
    `SELECT COUNT(*) AS n FROM ref_agriculture_tl`
  ).get() as { n: number }).n > 0;

  if (!alreadySeeded) {
    const seed = readFileSync(join(SQL_DIR, 'seed.sql'), 'utf8');
    db.exec(seed);
    console.log('[DB] Reference tables seeded.');
  }

  // Idempotent migrations for columns added after initial schema.
  try { db.exec('ALTER TABLE colonies ADD COLUMN active_turn_json TEXT'); } catch {}

  console.log(`[DB] Colony database open at ${path}`);
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Colony DB not initialised — call initColonyDb first');
  return db;
}
