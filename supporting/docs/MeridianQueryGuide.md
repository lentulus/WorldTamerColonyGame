# Meridian Query Guide

How to read star and world data from the Meridian parquet database.
Derived from `design/architecture.md` in the Meridian project and from
direct inspection of the manifest during WorldTamer Slice 1 development.

---

## The two-layer structure

```
MeridianData/
  manifest.db          — SQLite; one row per sector file (spatial index)
  systems/             — One parquet file per sector
  stars/               — One parquet file per sector (NOT in manifest)
  bodies/              — One parquet file per sector
  physical/            — One parquet file per sector
  star_orbits/         — One parquet file per sector
  satellites/          — One parquet file per sector
```

Sectors are 100-parsec cubes. Sol is at the centre of sector `s+00+00+00`,
which spans −50 to +50 pc in every axis. A query with a 20 pc radius from
Sol touches only this one sector. Near a sector boundary the same query
might touch 2–8 sectors, but never more.

---

## The manifest schema

```sql
CREATE TABLE sectors (
    sector_key   TEXT    NOT NULL,   -- e.g. 's+00+00+00'
    table_type   TEXT    NOT NULL,   -- see below
    file_path    TEXT    NOT NULL,   -- relative to MeridianData root
    row_count    INTEGER NOT NULL,
    x_min_mpc    INTEGER NOT NULL,   -- sector spatial extent in milliparsecs
    x_max_mpc    INTEGER NOT NULL,
    y_min_mpc    INTEGER NOT NULL,
    y_max_mpc    INTEGER NOT NULL,
    z_min_mpc    INTEGER NOT NULL,
    z_max_mpc    INTEGER NOT NULL,
    built_at     TEXT    NOT NULL,
    seed         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sector_key, table_type)
);
```

**Important:** `seed` is a 63-bit random integer. Do not SELECT it with
`node:sqlite` — Node.js cannot represent integers larger than 2^53 and
throws `ERR_OUT_OF_RANGE`. Always select only the columns you need.

---

## Table types in the manifest

| `table_type` | In manifest? | Notes |
|---|---|---|
| `systems` | Yes | Star system coordinates, name, distance from Sol |
| `bodies` | Yes | Planets and other bodies orbiting stars |
| `physical` | Yes | World-physical data (atmosphere, habitability, RVM…) |
| `star_orbits` | Yes | Orbital parameters for companion stars |
| `satellites` | Yes | Moons (Tiny class and above) |
| `stars` | **No** | Files exist; not indexed in the manifest |

---

## Stars: how to find the right file

The `stars/` directory contains one parquet file per sector with the same
naming convention as all other table types (`s+00+00+00.parquet`, etc.).
Because stars are absent from the manifest, derive the path from the
`bodies` path for the same sector:

```typescript
// bodies path:  /path/to/MeridianData/bodies/s+00+00+00.parquet
// stars path:   /path/to/MeridianData/stars/s+00+00+00.parquet

const starsPath = bodiesPath.replace(/[\\/]bodies[\\/]/, '/stars/');
```

Always look up `bodies` from the manifest first, then derive `stars` from
the result. Never hard-code sector keys.

---

## Finding which sectors overlap a spatial query

Coordinates in the manifest are stored in **milliparsecs (mpc)**.
1 parsec = 1,000 mpc. Sol is at (0, 0, 0) mpc.

For a sphere of radius R parsecs centred at (cx_pc, cy_pc, cz_pc):

```typescript
const cx_mpc = cx_pc * 1000;
const r_mpc  = R_pc  * 1000;

const getFiles = manifest.prepare(`
  SELECT file_path FROM sectors
  WHERE table_type = ?
    AND x_min_mpc < ? AND x_max_mpc > ?
    AND y_min_mpc < ? AND y_max_mpc > ?
    AND z_min_mpc < ? AND z_max_mpc > ?
`);

// Overlap condition: sector_min < query_max AND sector_max > query_min
const files = getFiles.all(
  'bodies',
  cx_mpc + r_mpc,   // x_max_mpc > cx - r  →  x_min_mpc < cx + r
  cx_mpc - r_mpc,
  cy_mpc + r_mpc,
  cy_mpc - r_mpc,
  cz_mpc + r_mpc,
  cz_mpc - r_mpc,
);
// Returns full relative paths, e.g. 'bodies/s+00+00+00.parquet'
// Prepend DATA to get the absolute path.
```

For a point lookup (single body or system), use `r_mpc = 0`. The overlap
condition `x_min_mpc < cx AND x_max_mpc > cx` finds the unique sector that
contains the point.

---

## Querying sector files with DuckDB

Pass an explicit file list to `read_parquet()` rather than a glob.
This limits DuckDB to the relevant sector files — for a 20 pc Sol query
that is one file per table type:

```typescript
function fileList(paths: string[]): string {
  return '[' + paths.map(p => `'${p}'`).join(', ') + ']';
}

// Example: read Garden worlds from the relevant physical sector files only
const sql = `
  SELECT body_id::VARCHAR AS body_id, system_id::VARCHAR AS system_id,
         world_type, habitability::INTEGER AS habitability
  FROM read_parquet(${fileList(physicalPaths)})
  WHERE world_type LIKE '%Garden%'
    AND habitability::INTEGER >= 5
    AND system_id::VARCHAR IN (${commaSeparatedSystemIds})
`;
```

---

## Within-sector predicate pushdown

Rows inside each sector parquet file are sorted by a **Z-order (Morton)
curve** on `(x_mpc, y_mpc, z_mpc)`. This means spatially nearby rows land
in the same row groups. DuckDB uses per-row-group min/max statistics to
skip row groups that don't overlap the query bounding box — equivalent to
a spatial index with no maintenance cost.

Apply an explicit bounding box filter on `x_mpc / y_mpc / z_mpc` to
trigger this skipping:

```sql
WHERE s.x_mpc BETWEEN -20000 AND 20000   -- 20 pc bounding box in mpc
  AND s.y_mpc BETWEEN -20000 AND 20000
  AND s.z_mpc BETWEEN -20000 AND 20000
  AND s.dist_pc <= 20.0                  -- exact sphere cut after bbox
```

The bounding box filter runs first and skips most row groups. The sphere
distance filter then discards the corners of the cube.

---

## Recommended query pattern for habitable world searches

```
1. manifest.db (SQLite, synchronous)
   → sector file paths for: systems, bodies, physical, satellites
   → derive stars paths from bodies paths

2. DuckDB — read_parquet([specific sector files])
   Step A: systems CTE — distance filter → matching system_ids
   Step B: physical CTE — Garden + habitability filter, IN (system_ids)
   Step C: bodies CTE   — body position (ROW_NUMBER), IN (system_ids)
   Step D: stars CTE    — primary spectral (ROW_NUMBER by luminosity), IN (system_ids)
   Final SELECT: join B+C+D against A for output

Result for a 20 pc Sol query: typically 1 sector file per table type,
query time under 1 second.
```

---

## Key identifiers

| Field | Type | Notes |
|---|---|---|
| `system_id` | INTEGER (64-bit) | Globally unique across all sectors. Encodes sector coordinates in high bits. Do not store as JS `number` — use `::VARCHAR` cast in DuckDB and keep as string in TypeScript. |
| `body_id` | INTEGER (64-bit) | Globally unique (encodes sector + sequence). Use `::VARCHAR` cast. |
| `star_id` | INTEGER (64-bit) | Same scheme. |

A JOIN between `bodies` and `physical` within one sector uses
`body_id::VARCHAR = p.body_id::VARCHAR AND system_id::VARCHAR = p.system_id::VARCHAR`.
Both columns are needed — body_id alone is not a safe cross-sector key
in older builds where sector-local sequential IDs were used.

---

## Coordinate system

| Field | Unit | Note |
|---|---|---|
| `x_mpc, y_mpc, z_mpc` | milliparsecs | Integer. Divide by 1000 for parsecs. |
| `dist_pc` | parsecs | Float. Distance from Sol. In systems table only. |
| `orbit_primary_au` | AU | Float. Body's orbital semi-major axis. |
| `axial_tilt_deg` | degrees | Float. 0 = no tilt; 90 = on its side. |

`dist_pc` is distance from Sol and is only meaningful when the query
centre is Sol. For queries centred elsewhere, compute geometric distance
from `x_mpc / y_mpc / z_mpc`.
