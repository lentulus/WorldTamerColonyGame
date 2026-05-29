-- WorldTamer colony simulation schema
-- All CREATE TABLE statements use IF NOT EXISTS so this file is idempotent.

-- ── Colony master ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS colonies (
  id                      INTEGER PRIMARY KEY,
  name                    TEXT    NOT NULL,
  system_name             TEXT    NOT NULL,
  body_id                 TEXT    NOT NULL UNIQUE,  -- one colony per world
  world_type              TEXT    NOT NULL,
  atmosphere_code         TEXT    NOT NULL,
  hydrographics_code      INTEGER NOT NULL,
  axial_tilt_deg          REAL    NOT NULL,
  star_spectral           TEXT    NOT NULL,
  orbit_au                REAL    NOT NULL,
  rvm                     INTEGER NOT NULL,
  habitability            INTEGER NOT NULL,

  tech_level              INTEGER NOT NULL,
  founded_month           INTEGER NOT NULL DEFAULT 0,
  current_month           INTEGER NOT NULL DEFAULT 0,

  home_tl                 INTEGER NOT NULL,
  acclimatization_stage   INTEGER NOT NULL DEFAULT 1,  -- 1..5
  political_track         INTEGER NOT NULL DEFAULT 1,  -- -3..+3; +1 = Level 3 "Good"

  -- Derived at founding, stored to avoid re-querying Meridian
  weather_factor          INTEGER NOT NULL,
  phi_min                 REAL    NOT NULL,

  -- Permanent output bonuses from random events
  ag_output_roll_bonus    INTEGER NOT NULL DEFAULT 0,

  -- Infrastructure state
  road_network_cr_spent   REAL    NOT NULL DEFAULT 0,
  transport_lines         TEXT    NOT NULL DEFAULT '[]',  -- JSON array of TransportLine

  -- In-progress turn (set by turn/start, cleared by turn/finalize)
  active_turn_json        TEXT
);

-- ── Turn snapshots ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS colony_turns (
  colony_id               INTEGER NOT NULL REFERENCES colonies(id),
  month                   INTEGER NOT NULL,

  -- Population (laborers; 1 laborer ≈ 4 people including dependants)
  total_laborers          INTEGER NOT NULL,
  al                      INTEGER NOT NULL,   -- agricultural
  il                      INTEGER NOT NULL,   -- industrial
  ml                      INTEGER NOT NULL,   -- materials
  afl                     INTEGER NOT NULL,   -- armed forces

  -- Capital units deployed
  ac                      INTEGER NOT NULL,   -- agricultural capital
  ic_light                INTEGER NOT NULL,
  ic_heavy                INTEGER NOT NULL,
  ic_construction         INTEGER NOT NULL,
  mc                      INTEGER NOT NULL,   -- materials capital
  power_kw                REAL    NOT NULL,

  -- Stockpiles at end of turn
  rations                 REAL    NOT NULL,
  raw_materials_t         REAL    NOT NULL,
  housing_m3              REAL    NOT NULL,
  sl_value_per_person     REAL    NOT NULL,   -- current SL goods value (decays 2%/month)
  debt_cr                 REAL    NOT NULL,

  -- Satisfaction indices computed this turn (applied as DMs next turn)
  sn                      REAL    NOT NULL,
  ss                      REAL    NOT NULL,
  sl                      REAL    NOT NULL,

  -- Political state at end of turn
  political_track         INTEGER NOT NULL,

  -- Roll results (NULL for founding month 0)
  weather_roll            INTEGER,
  weather_dm              INTEGER,
  weather_outcome         TEXT,   -- 'none'|'drought'|'severe_storm'|'catastrophic_storm'
  random_event_roll       INTEGER,
  political_roll          INTEGER,
  political_dm            INTEGER,
  political_outcome       TEXT,
  ag_output_roll          INTEGER,
  ag_output_dm            INTEGER,
  ag_output_mult          REAL,
  ind_output_roll         INTEGER,
  ind_output_dm           INTEGER,
  ind_output_mult         REAL,
  mat_output_roll         INTEGER,
  mat_output_dm           INTEGER,
  mat_output_mult         REAL,

  -- Production totals this turn
  q_a                     REAL,
  q_i                     REAL,
  q_m                     REAL,

  -- Infrastructure
  infrastructure_efficiency REAL NOT NULL DEFAULT 1.0,
  maintenance_cost_cr     REAL NOT NULL DEFAULT 0,

  PRIMARY KEY (colony_id, month)
);

-- ── Active events ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS colony_events (
  id                      INTEGER PRIMARY KEY,
  colony_id               INTEGER NOT NULL REFERENCES colonies(id),
  month                   INTEGER NOT NULL,
  event_type              TEXT    NOT NULL,
  description             TEXT    NOT NULL,
  effects                 TEXT    NOT NULL DEFAULT '{}',  -- JSON EventEffects
  active_until_month      INTEGER             -- NULL = resolved immediately
);

-- ── Reference tables (static WTH data, seeded once) ──────────────────────────

CREATE TABLE IF NOT EXISTS ref_agriculture_tl (
  tl                      INTEGER PRIMARY KEY,
  ac_cost_cr              REAL    NOT NULL,
  rm_t_per_month          REAL    NOT NULL,
  land_km2_per_al         REAL    NOT NULL,
  base_output_rations     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ref_industry_tl (
  tl                      INTEGER PRIMARY KEY,
  light_ic_cost_cr        REAL    NOT NULL,
  heavy_ic_cost_cr        REAL    NOT NULL,
  construction_ic_cost_cr REAL    NOT NULL,
  kw_per_unit             REAL    NOT NULL,
  rm_t_per_month          REAL    NOT NULL,
  output_cr_per_il_month  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ref_materials_tl (
  tl                      INTEGER PRIMARY KEY,
  mc_cost_cr              REAL    NOT NULL,
  kw_per_unit             REAL    NOT NULL,
  base_output_t_per_month INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ref_transport_tl (
  tl                      INTEGER PRIMARY KEY,
  line_load_mt_per_month  REAL    NOT NULL,
  cost_mcr_per_km         REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS ref_housing_tl (
  tl                      INTEGER PRIMARY KEY,
  km2_per_million_m3      REAL    NOT NULL
);

-- SN band → output DM and political DM
CREATE TABLE IF NOT EXISTS ref_sn_table (
  id          INTEGER PRIMARY KEY,
  sn_lo       REAL    NOT NULL,
  sn_hi       REAL    NOT NULL,
  output_dm   INTEGER NOT NULL,
  political_dm INTEGER NOT NULL
);

-- SS band (m³/person) → political DM only
CREATE TABLE IF NOT EXISTS ref_ss_table (
  id          INTEGER PRIMARY KEY,
  ss_lo       REAL    NOT NULL,
  ss_hi       REAL    NOT NULL,
  political_dm INTEGER NOT NULL
);

-- Home TL → starting SL goods value per person (Cr)
CREATE TABLE IF NOT EXISTS ref_sl_starting_value (
  tl_lo       INTEGER NOT NULL,
  tl_hi       INTEGER NOT NULL,
  value_cr    INTEGER NOT NULL,
  PRIMARY KEY (tl_lo)
);

-- D20 result → output multiplier
CREATE TABLE IF NOT EXISTS ref_output_roll (
  roll_lo     INTEGER NOT NULL,
  roll_hi     INTEGER NOT NULL,
  multiplier  REAL    NOT NULL,
  PRIMARY KEY (roll_lo)
);

-- Adjusted political roll → event and modifiers
-- roll_lo/roll_hi use -999/+999 as sentinels for open-ended bands
CREATE TABLE IF NOT EXISTS ref_political_table (
  id              INTEGER PRIMARY KEY,
  roll_lo         INTEGER NOT NULL,
  roll_hi         INTEGER NOT NULL,
  event_label     TEXT    NOT NULL,
  output_dm       INTEGER NOT NULL,  -- applied to sector(s) this turn
  affected_sectors TEXT   NOT NULL,  -- 'all'|'mat_ind'|'one_random'|'none'
  track_movement  INTEGER NOT NULL   -- −2, −1, 0, +1, +2
);

-- D20 random event table (triggers when weather roll ≥ 16)
CREATE TABLE IF NOT EXISTS ref_random_events (
  roll            INTEGER PRIMARY KEY,
  event_label     TEXT    NOT NULL,
  description     TEXT    NOT NULL,
  effects         TEXT    NOT NULL,  -- JSON EventEffects template
  political_dm    INTEGER NOT NULL,
  duration_months INTEGER NOT NULL   -- 0 = immediate/one-turn
);

-- Adjusted D20 weather roll → outcome
CREATE TABLE IF NOT EXISTS ref_weather_outcomes (
  id              INTEGER PRIMARY KEY,
  roll_lo         INTEGER NOT NULL,
  roll_hi         INTEGER NOT NULL,
  outcome         TEXT    NOT NULL   -- 'none'|'drought'|'severe_storm'|'catastrophic_storm'
);
