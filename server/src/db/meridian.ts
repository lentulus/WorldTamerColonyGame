import duckdb from 'duckdb';
import { Config } from '../config.js';
import type { WorldCandidate } from '@worldtamer/shared';

const duck = new duckdb.Database(':memory:');
const conn = duck.connect();

function run(sql: string): Promise<void> {
  return new Promise((resolve, reject) =>
    conn.run(sql, (err: Error | null) => (err ? reject(err) : resolve())));
}

function query<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) =>
    conn.all(sql, ...params, (err: Error | null, rows: unknown) => {
      if (err) return reject(err);
      resolve(rows as T[]);
    }));
}

let parquetLoaded = false;

async function ensureParquet(): Promise<void> {
  if (parquetLoaded) return;
  await run(`SET home_directory='${Config.meridianData}';`);
  parquetLoaded = true;
}

// Implemented in Slice 1
export async function getHabitableWorlds(): Promise<WorldCandidate[]> {
  await ensureParquet();
  throw new Error('getHabitableWorlds() not yet implemented — see Slice 1');
}

// Implemented in Slice 2
export async function getWorldById(
  _bodyId: string, _systemId: string
): Promise<WorldCandidate | null> {
  await ensureParquet();
  throw new Error('getWorldById() not yet implemented — see Slice 2');
}

export { query, run };
