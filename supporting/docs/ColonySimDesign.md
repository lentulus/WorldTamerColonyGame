# WorldTamer — Colony Simulation Design

*Design agreed 2026-05-28. All decisions in the Decided section are locked — do not re-litigate.*

---

## What it is

A single-user desktop web app for running a WTH colonial economy. The player acts as colony governor, making allocation decisions each month. The server resolves dice rolls, applies the WTH rules, and maintains the full turn-by-turn history. The rules source is **TNE 0311 World Tamer's Handbook, Chapter 4–5 only** — no Turchin equations, no GURPS Realm Management.

Time unit: one monthly turn (~750 hours). The player advances turns one at a time.

---

## Technology stack

| Layer | Technology | Reason |
|---|---|---|
| Server | TypeScript + Hono + `@hono/node-server` (port 3000) | Same as Worlds; proven pattern |
| Colony database | `node:sqlite` SQLite | Same as Worlds WORLDS_DB; self-contained file, easy to gitignore data while keeping schema in git |
| Star/planet data | DuckDB (read-only Meridian parquet) | Same as Worlds; Meridian is the authoritative source |
| Client | TypeScript + Vite | Same as Worlds; no framework |
| Shared types | `packages/shared` (pnpm workspace) | Same as Worlds |
| Package manager | pnpm workspaces | Same as Worlds |

The colony database file is gitignored. Schema and seed SQL live in `supporting/sql/` and are committed.

Meridian is accessed read-only at colony founding to pull world parameters. Those parameters are then stored in the colony record — Meridian is not queried on every turn.

---

## What is read from Meridian at founding

The Meridian parquet tables queried are the same ones used in the Worlds project (`systems/`, `bodies/`, `physical/`). The fields needed for WTH are:

| Meridian field | WTH use | Where stored |
|---|---|---|
| `primary_spectral` | Weather factor DM (A/F/K/M star type) | `colonies.star_spectral` |
| `axial_tilt_deg` | Weather factor DM | `colonies.axial_tilt_deg` |
| `hydrographics` | Weather factor DM (code 5+ = +1 DM) | `colonies.hydrographics_code` |
| `atmosphere_code` | Acclimatization requirement | `colonies.atmosphere_code` |
| `orbit_primary_au` | Growing season period (Kepler: AU^1.5 × 12 months) | `colonies.orbit_au` |
| `rvm` | Raw materials richness modifier (`2^(rvm/3)`) | `colonies.rvm` |
| `habitability` | Displayed; informs world selection | `colonies.habitability` |
| `world_type` | Displayed; informs world selection | `colonies.world_type` |

These eight values are read once and stored. After founding, WorldTamer makes no further Meridian queries for that colony.

**Note:** The body-id join requires both `body_id` and `system_id` (body_ids are sector-local, not globally unique in the current Meridian build). Use the same JOIN pattern as the Worlds project.

---

## Data model

### Colony master record

```
colonies
  id                    INTEGER PRIMARY KEY
  name                  TEXT NOT NULL
  system_name           TEXT NOT NULL          -- display only
  body_id               TEXT NOT NULL          -- Meridian reference, not a FK
  world_type            TEXT NOT NULL
  atmosphere_code       TEXT NOT NULL
  hydrographics_code    INTEGER NOT NULL       -- 0–10
  axial_tilt_deg        REAL NOT NULL
  star_spectral         TEXT NOT NULL          -- 'A','F','G','K','M', etc.
  orbit_au              REAL NOT NULL
  rvm                   INTEGER NOT NULL       -- Meridian RVM −3…+5
  habitability          INTEGER NOT NULL       -- Meridian 0–19

  tech_level            INTEGER NOT NULL       -- colony TL (may differ from equipment TL)
  founded_month         INTEGER NOT NULL       -- simulation month 0
  current_month         INTEGER NOT NULL       -- simulation month at present

  home_tl               INTEGER NOT NULL       -- colonists' origin TL (sets SL baseline)
  acclimatization_stage INTEGER NOT NULL       -- 1–5 (5 = fully acclimatized)
  political_track       INTEGER NOT NULL       -- −3…+3 (starts at +1 = Level 3 "Good")
```

### Turn snapshots

One row per completed month. This is the full colony state at end of each turn, enabling charts and replay.

```
colony_turns
  colony_id             INTEGER NOT NULL REFERENCES colonies(id)
  month                 INTEGER NOT NULL       -- 0 = founding
  PRIMARY KEY (colony_id, month)

  -- Population (laborers; 1 laborer ≈ 4 people including dependants)
  total_laborers        INTEGER NOT NULL
  al                    INTEGER NOT NULL       -- agricultural laborers
  il                    INTEGER NOT NULL       -- industrial laborers
  ml                    INTEGER NOT NULL       -- materials laborers
  afl                   INTEGER NOT NULL       -- armed forces laborers

  -- Capital units deployed
  ac                    INTEGER NOT NULL       -- agricultural capital units
  ic_light              INTEGER NOT NULL       -- light industrial capital
  ic_heavy              INTEGER NOT NULL       -- heavy industrial capital
  ic_construction       INTEGER NOT NULL       -- construction capital
  mc                    INTEGER NOT NULL       -- materials capital units
  power_kw              REAL NOT NULL          -- installed power capacity

  -- Stockpiles
  rations               REAL NOT NULL          -- rations in store
  raw_materials_t       REAL NOT NULL          -- tonnes in store
  housing_m3            REAL NOT NULL          -- total housing cubic metres
  sl_value_per_person   REAL NOT NULL          -- current SL goods value (decays 2%/month)
  debt_cr               REAL NOT NULL          -- cumulative debt in credits

  -- Satisfaction indices (this turn, used as DMs next turn)
  sn                    REAL NOT NULL          -- Standard of Nutrition
  ss                    REAL NOT NULL          -- Standard of Shelter
  sl                    REAL NOT NULL          -- Standard of Living

  -- Political
  political_track       INTEGER NOT NULL       -- track level at end of this turn

  -- Turn roll results (stored for the log)
  weather_roll          INTEGER                -- raw D20
  weather_outcome       TEXT                   -- 'none','drought','severe_storm','catastrophic_storm'
  random_event_roll     INTEGER                -- second D20 if first ≥16, else null
  political_roll        INTEGER                -- raw D20 + DMs
  political_outcome     TEXT                   -- event description
  ag_output_roll        INTEGER
  ind_output_roll       INTEGER
  mat_output_roll       INTEGER
```

### Events log

```
colony_events
  id                    INTEGER PRIMARY KEY
  colony_id             INTEGER NOT NULL REFERENCES colonies(id)
  month                 INTEGER NOT NULL
  event_type            TEXT NOT NULL          -- 'weather','random','political','acclimatization'
  description           TEXT NOT NULL
  effects               TEXT NOT NULL          -- JSON: {sector, modifier, duration_months, ...}
  active_until_month    INTEGER                -- null = resolved immediately
```

### Reference tables (static WTH lookup data, seeded at DB creation)

```
ref_agriculture_tl   (tl, ac_cost_cr, rm_t_per_month, land_km2_per_al, base_output_rations)
ref_industry_tl      (tl, light_ic_cost_cr, heavy_ic_cost_cr, construction_ic_cost_cr,
                         kw_per_unit, rm_t_per_month, output_cr_per_il_month)
ref_materials_tl     (tl, mc_cost_cr, kw_per_unit, base_output_t_per_month)
ref_transport_tl     (tl, line_load_mt_per_month, cost_mcr_per_km)
ref_housing_tl       (tl, km2_per_million_m3)
ref_sn_table         (sn_lo, sn_hi, output_dm, political_dm)
ref_ss_table         (ss_lo_m3, ss_hi_m3, political_dm)
ref_political_table  (roll_lo, roll_hi, event_label, output_dm, track_movement)
ref_output_roll      (roll_lo, roll_hi, multiplier)
ref_weather_table    (roll_lo, roll_hi, outcome)
ref_random_events    (roll, event_label, output_effect, political_dm, description)
```

---

## The turn engine — 8 WTH steps

The server processes steps in sequence. Each step is deterministic once the dice are fixed. All dice results for a turn are rolled at the start of step 1 (so the turn record is complete before allocation decisions are needed).

| Step | Server does | Player decides |
|---|---|---|
| 1 — Events & Politics | Roll weather; roll random event (if ≥16); apply satisfaction DMs from previous turn; roll political table; record political track change | — |
| 2 — Output Rolls | Roll D20 per sector; apply all DMs; record multipliers | — |
| 3 — Rations | Compute agricultural output × multiplier; add to stockpile | **Allocate rations** (population / stockpile / export / animals) |
| 4 — Energy | Compute power from installed capacity; check sufficiency | — |
| 5 — Raw Materials | Compute materials output × multiplier; check power sufficiency | **Allocate raw materials** (ag / industry / energy / stockpile / export) |
| 6 — Industrial Output | Compute industrial output × multiplier | **Allocate credits** (new capital / housing / consumer goods / export / armed forces) |
| 7 — Capital & Labor | Apply new capital purchases; compute maintenance cost; check infrastructure | **Reassign laborers** for next turn |
| 8 — Off-world Trade | Convert export quantities to displacement tons; compute revenue (arrives in 24 months) | *(deferred to a later slice)* |

The server validates that allocations don't exceed available resources. If the player submits an impossible allocation, the server returns a validation error without advancing the turn.

---

## Growing season

The WTH model assumes a seasonal growing cycle. Agricultural output is modulated by:

> φ(t) = phi_min + (1 − phi_min) × 0.5 × (1 + sin(2π(t − season_months/4) / season_months))

where `phi_min` is derived from axial tilt and tidal locking (same formula as `colony_export.py`), and `season_months = orbit_au^1.5 × 12`. This is computed server-side from the stored orbital parameters.

---

## Weather factor

Computed once at founding from the stored planetary parameters:

> weather_factor = star_spectral_dm + axial_tilt_dm + hydrographics_dm

Where the DM table values are from WTH Chapter 4.

Stored as `colonies.weather_factor` (integer). Used as a DM on the D20 weather roll each month.

---

## UI layout

Three panels, same layout philosophy as the Worlds Ship Design Tool.

```
┌──────────────────┬─────────────────────────┬──────────────────┐
│  COLONY STATUS   │     TURN RESOLUTION      │   ALLOCATION     │
│                  │                          │                  │
│  Month 14        │  Step 1 — Events         │  Rations         │
│  TL 8            │  Weather roll: 12 → None │  [ distribute ]  │
│  Pop: 3,200      │  Political roll: 17 →    │                  │
│                  │   Productive (+1 ag)     │  Raw Materials   │
│  Laborers        │                          │  [ distribute ]  │
│  AL: 200         │  Step 2 — Output Rolls   │                  │
│  IL: 150         │  Ag roll: 15 → ×1.05     │  Industrial      │
│  ML: 100         │  Ind roll:  9 → ×1.00    │  Output          │
│                  │  Mat roll: 18 → ×1.15    │  [ distribute ]  │
│  Stockpiles      │                          │                  │
│  Rations: 4,200  │  Step 3 — Rations        │  Laborers        │
│  Raw mat: 180 t  │  Produced: 1,260         │  (next month)    │
│                  │  Allocated: 800          │  [ reassign ]    │
│  SN: 1.04  ✓    │  Surplus: 460            │                  │
│  SS: 0.92  ⚠    │                          │  [ Advance Turn ]│
│  SL: 1.11  ✓    │  ...                     │                  │
│                  │                          │                  │
│  PT: +1 (Good)   │                          │                  │
└──────────────────┴─────────────────────────┴──────────────────┘
```

---

## Build sequence (slices)

| Slice | Goal |
|---|---|
| 0 | Scaffold: pnpm workspaces, Hono server, Vite client, shared types, SQLite schema + reference data seed, .gitignore |
| 1 | World selection: query Meridian for habitable worlds; display list; pick one |
| 2 | Colony founding: initial state form (laborers, capital, TL, home TL); create colony record + turn 0 snapshot |
| 3 | Turn engine core: output rolls + steps 1–2 resolution; display in centre panel |
| 4 | Rations + raw materials allocation (steps 3–5); SN calculation |
| 5 | Industrial allocation (step 6); SS + SL calculation; political track update |
| 6 | Labor reassignment (step 7); new capital applied; maintenance deducted |
| 7 | Weather events + random events; acclimatization stage tracking |
| 8 | Infrastructure check (road network, transport capacity) |
| 9 | Smoke test + sign-off |
| *(later)* | Off-world trade (step 8); armed forces; multi-colony |

---

## Decided

| # | Decision | Answer |
|---|---|---|
| D-1 | Single colony or multi? | One colony per world (unique constraint on `body_id`). Data model supports multiple; UI starts without a colony list. Multi-colony UI is a future enhancement — nothing structural blocks it. |
| D-2 | Full turn history or current state only? | Full history. One `colony_turns` row per completed month. Essential for charting and referee use. |
| D-3 | Controlled economy or free-market? | Controlled economy only. −1 DM always applied to all output rolls. Free-market deferred — it would require an allocation AI. |
| D-4 | Armed forces scope? | AFL headcount and power draw only. No weapons, vehicles, or readiness mechanics. Data model leaves room for an armed forces detail table without restructuring. |
| D-5 | Growing season model? | Sinusoidal φ(t) from orbit_au and axial tilt. Each world gets its own seasonal character. |
| D-6 | Land tracking? | Abstract — total km² per use category, no hex map. Land data structured so per-hex records could replace it in a future mapping integration. |
| D-7 | Port number? | 3001 (avoids collision with Worlds on 3000). |

---

## What is explicitly out of scope (first version)

- Turchin political stress equations
- GURPS Realm Management revenue, Realm Value, Education Rating
- Armed forces readiness and equipment design
- Hex-level land mapping
- Free-market economy mode
- Off-world trade (step 8) — deferred to slice 9
- Multi-colony management
