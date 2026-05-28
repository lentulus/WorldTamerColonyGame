import duckdb from 'duckdb';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { Config } from '../config.js';
import type { WorldCandidate, WorldListParams } from '@worldtamer/shared';

const DATA = Config.meridianData;

// ── DuckDB singleton ──────────────────────────────────────────────────────────

const duck = new duckdb.Database(':memory:');
const conn = duck.connect();

function query<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) =>
    conn.all(sql, ...params, (err: Error | null, rows: unknown) => {
      if (err) return reject(err);
      resolve(rows as T[]);
    }));
}

// ── Manifest (SQLite, fast synchronous sector lookup) ─────────────────────────
// Sectors are 100-pc cubes. x/y/z extents stored in milliparsecs.
// A 20-pc sphere from Sol fits entirely inside s+00+00+00 — one sector.

const manifest = new DatabaseSync(join(DATA, 'manifest.db'), { open: true });

const getFiles = manifest.prepare(`
  SELECT file_path FROM sectors
  WHERE table_type = ?
    AND x_min_mpc < ? AND x_max_mpc > ?
    AND y_min_mpc < ? AND y_max_mpc > ?
    AND z_min_mpc < ? AND z_max_mpc > ?
`);

interface ManifestRow { file_path: string }

function sectorFiles(
  tableType: string,
  cx_mpc: number, cy_mpc: number, cz_mpc: number,
  r_mpc: number,
): string[] {
  return (getFiles.all(
    tableType,
    cx_mpc + r_mpc, cx_mpc - r_mpc,
    cy_mpc + r_mpc, cy_mpc - r_mpc,
    cz_mpc + r_mpc, cz_mpc - r_mpc,
  ) as ManifestRow[]).map(r => join(DATA, r.file_path));
}

// Stars are not in the manifest. Derive paths from the bodies sector files —
// both follow the same s+XX+YY+ZZ.parquet naming convention.
function starFilesFrom(bodiesPaths: string[]): string[] {
  return bodiesPaths.map(p => p.replace(/[\\/]bodies[\\/]/, '/stars/'));
}

// DuckDB read_parquet() accepts an array literal: read_parquet(['f1','f2'])
function fileList(paths: string[]): string {
  return '[' + paths.map(p => `'${p}'`).join(', ') + ']';
}

// ── Shared row type ───────────────────────────────────────────────────────────

interface RawWorldRow {
  body_id: string;
  system_id: string;
  system_name: string | null;
  dist_pc: number;
  x_mpc: number;
  y_mpc: number;
  z_mpc: number;
  world_type: string;
  atmosphere_code: string;
  hydrographics_code: number | string;
  axial_tilt_deg: number | string;
  tidally_locked: boolean | number;
  orbit_au: number | string;
  body_position: number | string;
  rvm: number | string;
  habitability: number | string;
  star_spectral: string;
}

function toCandidate(r: RawWorldRow): WorldCandidate {
  return {
    body_id:           r.body_id,
    system_id:         r.system_id,
    system_name:       r.system_name ?? r.system_id,
    body_position:     Number(r.body_position),
    world_type:        r.world_type,
    atmosphere_code:   r.atmosphere_code,
    hydrographics_code: Number(r.hydrographics_code),
    axial_tilt_deg:    Number(r.axial_tilt_deg),
    tidally_locked:    Boolean(r.tidally_locked),
    orbit_au:          Number(r.orbit_au),
    rvm:               Number(r.rvm),
    habitability:      Number(r.habitability),
    star_spectral:     r.star_spectral,
    dist_pc:           Number(r.dist_pc),
  };
}

// ── getHabitableWorlds ────────────────────────────────────────────────────────

export async function getHabitableWorlds(params: WorldListParams): Promise<WorldCandidate[]> {
  const cx_mpc = (params.center_x_pc ?? 0) * 1000;
  const cy_mpc = (params.center_y_pc ?? 0) * 1000;
  const cz_mpc = (params.center_z_pc ?? 0) * 1000;
  const r_mpc  = params.max_dist_pc * 1000;
  const minHab = params.min_habitability ?? 1;
  const limit  = Math.min(params.limit  ?? 100, 200);
  const offset = params.offset ?? 0;

  // Manifest lookup: which sector files overlap the bounding box?
  const physFiles   = sectorFiles('physical', cx_mpc, cy_mpc, cz_mpc, r_mpc);
  const bodiesFiles = sectorFiles('bodies',   cx_mpc, cy_mpc, cz_mpc, r_mpc);
  const sysFiles    = sectorFiles('systems',  cx_mpc, cy_mpc, cz_mpc, r_mpc);
  const starsFiles  = starFilesFrom(bodiesFiles);  // stars not in manifest; derive from bodies paths

  if (physFiles.length === 0) return [];

  // Bounding box in mpc — lets DuckDB's Z-order row-group stats skip most groups
  const xLo = cx_mpc - r_mpc, xHi = cx_mpc + r_mpc;
  const yLo = cy_mpc - r_mpc, yHi = cy_mpc + r_mpc;
  const zLo = cz_mpc - r_mpc, zHi = cz_mpc + r_mpc;

  // Distance expressions (cx/cy/cz as TypeScript numbers — safe to interpolate)
  const cx_pc = params.center_x_pc ?? 0;
  const cy_pc = params.center_y_pc ?? 0;
  const cz_pc = params.center_z_pc ?? 0;
  const hasCentre = cx_pc !== 0 || cy_pc !== 0 || cz_pc !== 0;

  const distFromCentre = hasCentre
    ? `SQRT(POW(ir.x_mpc::DOUBLE/1000.0-(${cx_pc}),2)+POW(ir.y_mpc::DOUBLE/1000.0-(${cy_pc}),2)+POW(ir.z_mpc::DOUBLE/1000.0-(${cz_pc}),2))`
    : `ir.dist_pc`;

  const distFilterInRange = hasCentre
    ? `SQRT(POW(s.x_mpc::DOUBLE/1000.0-(${cx_pc}),2)+POW(s.y_mpc::DOUBLE/1000.0-(${cy_pc}),2)+POW(s.z_mpc::DOUBLE/1000.0-(${cz_pc}),2)) <= ${params.max_dist_pc}`
    : `s.dist_pc <= ${params.max_dist_pc}`;

  const sql = `
    WITH
    in_range AS (
      SELECT system_id::VARCHAR AS system_id,
             primary_name,
             dist_pc::DOUBLE   AS dist_pc,
             x_mpc::INTEGER    AS x_mpc,
             y_mpc::INTEGER    AS y_mpc,
             z_mpc::INTEGER    AS z_mpc
      FROM read_parquet(${fileList(sysFiles)}) s
      WHERE s.x_mpc BETWEEN ${xLo} AND ${xHi}
        AND s.y_mpc BETWEEN ${yLo} AND ${yHi}
        AND s.z_mpc BETWEEN ${zLo} AND ${zHi}
        AND ${distFilterInRange}
    ),
    garden_worlds AS (
      SELECT p.body_id::VARCHAR         AS body_id,
             p.system_id::VARCHAR       AS system_id,
             p.world_type,
             p.atmosphere_code,
             p.hydrographics::INTEGER   AS hydrographics_code,
             p.axial_tilt_deg::DOUBLE   AS axial_tilt_deg,
             p.tidally_locked::BOOLEAN  AS tidally_locked,
             p.rvm::INTEGER             AS rvm,
             p.habitability::INTEGER    AS habitability
      FROM read_parquet(${fileList(physFiles)}) p
      WHERE p.world_type LIKE '%Garden%'
        AND p.habitability::INTEGER >= ${minHab}
        AND p.system_id::VARCHAR IN (SELECT system_id FROM in_range)
    ),
    ranked_bodies AS (
      SELECT body_id::VARCHAR   AS body_id,
             system_id::VARCHAR AS system_id,
             orbit_primary_au,
             ROW_NUMBER() OVER (PARTITION BY system_id::VARCHAR ORDER BY orbit_primary_au)
               AS body_position
      FROM read_parquet(${fileList(bodiesFiles)}) b
      WHERE b.system_id::VARCHAR IN (SELECT system_id FROM garden_worlds)
    ),
    primary_stars AS (
      SELECT system_id::VARCHAR AS system_id, spectral
      FROM (
        SELECT system_id, spectral, luminosity_sol,
               ROW_NUMBER() OVER (PARTITION BY system_id ORDER BY luminosity_sol DESC) AS rn
        FROM read_parquet(${fileList(starsFiles)}) st
        WHERE st.system_id::VARCHAR IN (SELECT system_id FROM garden_worlds)
      ) t WHERE t.rn = 1
    )
    SELECT
      gw.body_id,
      gw.system_id,
      COALESCE(ir.primary_name, gw.system_id) AS system_name,
      ir.dist_pc,
      ir.x_mpc,
      ir.y_mpc,
      ir.z_mpc,
      gw.world_type,
      gw.atmosphere_code,
      gw.hydrographics_code,
      gw.axial_tilt_deg,
      gw.tidally_locked,
      rb.orbit_primary_au      AS orbit_au,
      rb.body_position::INTEGER AS body_position,
      gw.rvm,
      gw.habitability,
      COALESCE(ps.spectral, '?') AS star_spectral
    FROM garden_worlds gw
    JOIN in_range ir       ON ir.system_id = gw.system_id
    JOIN ranked_bodies rb  ON rb.system_id = gw.system_id AND rb.body_id = gw.body_id
    LEFT JOIN primary_stars ps ON ps.system_id = gw.system_id
    ORDER BY ${distFromCentre} ASC
    LIMIT ${limit} OFFSET ${offset}`;

  const rows = await query<RawWorldRow>(sql);
  return rows.map(toCandidate);
}

// ── getWorldById ──────────────────────────────────────────────────────────────
// Single-record lookup at colony founding. Uses glob — acceptable for a one-off
// call; no sustained scan. Reads only the sector containing the target system.

export async function getWorldById(bodyId: string, systemId: string): Promise<WorldCandidate | null> {
  // First get the system's coordinates so we can find the right sector files
  const sysRows = await query<{x_mpc: number; y_mpc: number; z_mpc: number; primary_name: string | null; dist_pc: number}>(
    `SELECT x_mpc::INTEGER AS x_mpc, y_mpc::INTEGER AS y_mpc, z_mpc::INTEGER AS z_mpc,
            primary_name, dist_pc::DOUBLE AS dist_pc
     FROM read_parquet('${DATA}/systems/*.parquet')
     WHERE system_id::VARCHAR = ?
     LIMIT 1`,
    systemId
  );

  if (!sysRows.length) return null;
  const sys = sysRows[0];

  // Use a 0-radius bounding box (point lookup) to find the single sector
  const physFiles   = sectorFiles('physical', sys.x_mpc, sys.y_mpc, sys.z_mpc, 0);
  const bodiesFiles = sectorFiles('bodies',   sys.x_mpc, sys.y_mpc, sys.z_mpc, 0);
  const starsFiles  = starFilesFrom(bodiesFiles);

  if (!physFiles.length) return null;

  const sql = `
    WITH
    ranked_bodies AS (
      SELECT body_id::VARCHAR AS body_id, system_id::VARCHAR AS system_id,
             orbit_primary_au,
             ROW_NUMBER() OVER (PARTITION BY system_id::VARCHAR ORDER BY orbit_primary_au)
               AS body_position
      FROM read_parquet(${fileList(bodiesFiles)})
      WHERE system_id::VARCHAR = ?
    ),
    primary_stars AS (
      SELECT system_id::VARCHAR AS system_id, spectral
      FROM (
        SELECT system_id, spectral, luminosity_sol,
               ROW_NUMBER() OVER (PARTITION BY system_id ORDER BY luminosity_sol DESC) AS rn
        FROM read_parquet(${fileList(starsFiles)})
        WHERE system_id::VARCHAR = ?
      ) t WHERE t.rn = 1
    )
    SELECT
      p.body_id::VARCHAR          AS body_id,
      p.system_id::VARCHAR        AS system_id,
      rb.orbit_primary_au         AS orbit_au,
      rb.body_position::INTEGER   AS body_position,
      p.world_type,
      p.atmosphere_code,
      p.hydrographics::INTEGER    AS hydrographics_code,
      p.axial_tilt_deg::DOUBLE    AS axial_tilt_deg,
      p.tidally_locked::BOOLEAN   AS tidally_locked,
      p.rvm::INTEGER              AS rvm,
      p.habitability::INTEGER     AS habitability,
      COALESCE(ps.spectral, '?') AS star_spectral
    FROM read_parquet(${fileList(physFiles)}) p
    JOIN ranked_bodies rb  ON rb.body_id = p.body_id::VARCHAR AND rb.system_id = p.system_id::VARCHAR
    LEFT JOIN primary_stars ps ON ps.system_id = p.system_id::VARCHAR
    WHERE p.body_id::VARCHAR   = ?
      AND p.system_id::VARCHAR = ?
    LIMIT 1`;

  const rows = await query<Omit<RawWorldRow, 'system_name' | 'dist_pc' | 'x_mpc' | 'y_mpc' | 'z_mpc'>>(
    sql, systemId, systemId, bodyId, systemId
  );

  if (!rows.length) return null;
  const r = rows[0] as RawWorldRow;
  return toCandidate({
    ...r,
    system_name: sys.primary_name,
    dist_pc: sys.dist_pc,
    x_mpc: sys.x_mpc,
    y_mpc: sys.y_mpc,
    z_mpc: sys.z_mpc,
  });
}
