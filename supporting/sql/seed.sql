-- WorldTamer reference data seed — WTH source values
-- All INSERTs use INSERT OR IGNORE so re-running is safe.

-- ── Agriculture TL table (WTH Ch.4) ──────────────────────────────────────────
-- Columns: tl, ac_cost_cr, rm_t_per_month, land_km2_per_al, base_output_rations
-- TL 0-3 have no RM consumption; TL 0 has no capital cost (pre-industrial).
INSERT OR IGNORE INTO ref_agriculture_tl VALUES
  (0,      0,  0, 0.10,  2),
  (1,    300,  0, 0.15,  3),
  (2,    800,  0, 0.20,  4),
  (3,   1500,  0, 0.30,  6),
  (4,   2400,  1, 0.40,  9),
  (5,   4000,  2, 0.50, 12),
  (6,   6000,  4, 0.60, 15),
  (7,   9800,  6, 0.70, 21),
  (8,  14400,  8, 0.80, 27),
  (9,  18000, 10, 0.90, 33),
  (10, 21000, 12, 1.00, 39),
  (11, 24200, 14, 1.10, 45),
  (12, 27600, 16, 1.00, 52),
  (13, 31200, 14, 0.80, 60),
  (14, 35000, 12, 0.60, 68),
  (15, 39000, 10, 0.40, 75);

-- ── Industry TL table (WTH Ch.4) ─────────────────────────────────────────────
-- Columns: tl, light_ic, heavy_ic, construction_ic, kw/unit, rm_t/month, output_cr/IL·month
-- heavy_ic = 3× light; construction_ic = 0.5× light (per WTH table)
-- RM for heavy goods = 2× listed value (handled in engine, not here)
INSERT OR IGNORE INTO ref_industry_tl VALUES
  (0,      5,     15,    2.5, 0.0,  0.1,   50),
  (1,     10,     30,    5.0, 0.0,  0.2,   75),
  (2,     15,     45,    7.5, 0.0,  0.3,  100),
  (3,    150,    450,   75.0, 0.1,  1.0,  200),
  (4,    500,   1500,  250.0, 0.2,  4.0,  300),
  (5,   1350,   4050,  675.0, 0.3,  7.0,  500),
  (6,   3000,   9000, 1500.0, 0.4, 15.0,  750),
  (7,   6500,  19500, 3250.0, 0.8, 30.0, 1000),
  (8,  11000,  33000, 5500.0, 1.2, 45.0, 1500),
  (9,  15000,  45000, 7500.0, 1.5, 55.0, 2000),
  (10, 20000,  60000,10000.0, 1.8, 65.0, 2500),
  (11, 24000,  72000,12000.0, 2.0, 70.0, 3000),
  (12, 28000,  84000,14000.0, 2.2, 75.0, 3500),
  (13, 32000,  96000,16000.0, 2.4, 80.0, 4000),
  (14, 37000, 111000,18500.0, 2.6, 85.0, 4500),
  (15, 42000, 126000,21000.0, 2.8, 90.0, 5000);

-- ── Materials TL table (WTH Ch.4) ────────────────────────────────────────────
-- Columns: tl, mc_cost_cr, kw/unit, base_output_t/month
INSERT OR IGNORE INTO ref_materials_tl VALUES
  (0,   0.5, 0.0,   1),
  (1,   1.0, 0.0,   2),
  (2,   1.5, 0.0,   3),
  (3,  15.0, 0.1,  10),
  (4,  50.0, 0.2,  40),
  (5, 135.0, 0.3,  70),
  (6, 300.0, 0.4, 150),
  (7, 650.0, 0.8, 300),
  (8, 1100.0, 1.2, 450),
  (9, 1500.0, 1.5, 550),
  (10, 2000.0, 1.8, 650),
  (11, 2400.0, 2.0, 700),
  (12, 2800.0, 2.2, 750),
  (13, 3200.0, 2.4, 800),
  (14, 3700.0, 2.6, 850),
  (15, 4200.0, 2.8, 900);

-- ── Transport TL table (WTH Ch.4 — resource lines) ───────────────────────────
-- Columns: tl, line_load_mt_per_month, cost_mcr_per_km
INSERT OR IGNORE INTO ref_transport_tl VALUES
  (0, 0.1, 0.0005),
  (1, 0.5, 0.0010),
  (2, 1.0, 0.0015),
  (3, 4.0, 0.0030),
  (4, 6.0, 0.0040),
  (5, 8.0, 0.0050),
  (6, 10.0, 0.0060),
  (7, 15.0, 0.0080),
  (8, 30.0, 0.0100);

-- ── Housing TL table (WTH Ch.4) ──────────────────────────────────────────────
-- WTH gives values at TL 0,2,4,6,8,10,12,15. Odd TLs linearly interpolated.
-- Columns: tl, km2_per_million_m3
INSERT OR IGNORE INTO ref_housing_tl VALUES
  (0,  4.000),
  (1,  2.500),
  (2,  1.000),
  (3,  0.800),
  (4,  0.600),
  (5,  0.500),
  (6,  0.400),
  (7,  0.325),
  (8,  0.250),
  (9,  0.225),
  (10, 0.200),
  (11, 0.175),
  (12, 0.150),
  (13, 0.117),
  (14, 0.083),
  (15, 0.050);

-- ── SN table (WTH Ch.4) ──────────────────────────────────────────────────────
-- output_dm applies every month to all sector output rolls when SN is in this band.
-- political_dm is added to the political roll next month.
-- SN < 0.45 is extreme famine — treated as the lowest band with a further penalty in engine.
-- Gap 1.11–1.19 absorbed into the 0.95–1.1 band (no effect).
INSERT OR IGNORE INTO ref_sn_table VALUES
  (1,  0.00, 0.44, -8, -4),
  (2,  0.45, 0.54, -8, -4),
  (3,  0.55, 0.64, -5, -3),
  (4,  0.65, 0.74, -3, -2),
  (5,  0.75, 0.84, -2, -1),
  (6,  0.85, 0.94, -1, -1),
  (7,  0.95, 1.19,  0,  0),
  (8,  1.20, 2.00,  0,  1),
  (9,  2.10, 3.00,  0,  2),
  (10, 3.10, 6.00,  0,  3),
  (11, 6.10,10.00,  0,  4),
  (12,10.10,999.0,  0,  5);

-- ── SS table (WTH Ch.4) ──────────────────────────────────────────────────────
-- ss values are m³ of housing per person.
-- Below 25 m³ = extreme overcrowding; treated as below the lowest band.
INSERT OR IGNORE INTO ref_ss_table VALUES
  (1,   0,  24, -3),
  (2,  25,  50, -2),
  (3,  51,  80, -1),
  (4,  81, 120,  0),
  (5, 121, 160,  1),
  (6, 161, 250,  2),
  (7, 251, 350,  3),
  (8, 351, 9999, 4);

-- ── SL starting value (WTH Ch.4) ─────────────────────────────────────────────
INSERT OR IGNORE INTO ref_sl_starting_value VALUES
  (0,  3,    5),
  (4,  5,   50),
  (6,  8,  250),
  (9, 10,  500),
  (11,13, 1500),
  (14,16, 2500);

-- ── Output roll table (WTH Ch.5) ─────────────────────────────────────────────
-- D20 roll (before DMs; DMs shift the effective roll into these bands)
INSERT OR IGNORE INTO ref_output_roll VALUES
  (1,  1,  0.80),
  (2,  3,  0.85),
  (4,  5,  0.90),
  (6,  7,  0.95),
  (8, 13,  1.00),
  (14,15,  1.05),
  (16,17,  1.10),
  (18,19,  1.15),
  (20,99,  1.20);

-- ── Political table (WTH Ch.5) ───────────────────────────────────────────────
-- Adjusted roll (D20 + all DMs). Sentinels: -999 = open low, +999 = open high.
-- affected_sectors: 'all'|'mat_ind'|'one_random'|'none'
INSERT OR IGNORE INTO ref_political_table VALUES
  (1,  -999, -5, 'Coup Attempt',          -5, 'all',        -2),
  (2,    -4, -4, 'Severe Riots',           -4, 'all',        -2),
  (3,    -3, -3, 'Assassination Attempt',  -4, 'all',        -1),
  (4,    -2, -2, 'Severe Riots',           -3, 'all',        -1),
  (5,    -1, -1, 'Strikes',               -3, 'mat_ind',    -1),
  (6,     0,  0, 'Riots',                 -2, 'all',         0),
  (7,     1,  1, 'Riots',                 -2, 'all',         0),
  (8,     2,  3, 'Boycotts/Slowdowns',    -2, 'one_random',  0),
  (9,     4,  5, 'Dissatisfaction',       -1, 'one_random',  0),
  (10,    6, 15, 'No Effect',              0, 'none',         0),
  (11,   16, 19, 'Productive',            +1, 'one_random',  0),
  (12,   20, 21, 'Productive',            +1, 'all',         0),
  (13,   22, 23, 'Very Productive',       +1, 'all',        +1),
  (14,   24, 24, 'Very Productive',       +2, 'all',        +1),
  (15,   25,999, 'Excellent',             +2, 'all',        +2);

-- ── Random events table (WTH Ch.5) ───────────────────────────────────────────
-- effects: JSON template; duration_months: 0 = one-turn, >0 = multi-turn
INSERT OR IGNORE INTO ref_random_events VALUES
  (1,  'Severe Plague',
       '1D10 deaths/day until Impossible Medical (Diagnosis) task succeeds',
       '{"all_output_dm":-4,"political_dm":-2}', -2, 3),
  (2,  'Severe Livestock Disease',
       'Agricultural output halved until Impossible Medical/Vet task succeeds',
       '{"ag_output_dm":-99,"political_dm":-2}', -2, 3),
  (3,  'Moderate Plague',
       '1D6 deaths/day until Formidable Medical (Diagnosis) task succeeds',
       '{"all_output_dm":-2,"political_dm":-2}', -2, 2),
  (4,  'Moderate Livestock Disease',
       'Agricultural output reduced 25% until Formidable Medical/Vet task succeeds',
       '{"ag_output_dm":-2,"political_dm":-1}', -1, 2),
  (5,  'Hostile Starship Visit',
       'Referee discretion — no mechanical effect coded',
       '{}', 0, 0),
  (6,  'Vermin Eat Rations (Major)',
       'Up to 50% of stored rations consumed by vermin',
       '{"rations_lost_fraction":0.50,"political_dm":-2}', -2, 0),
  (7,  'Crop Blight',
       'Agricultural output halved this turn',
       '{"ag_output_dm":-99,"political_dm":-2}', -2, 0),
  (8,  'Earthquake',
       'Up to 10% of housing destroyed',
       '{"housing_lost_fraction":0.10,"political_dm":-1}', -1, 0),
  (9,  'Vermin Eat Rations (Minor)',
       'Up to 25% of stored rations consumed by vermin',
       '{"rations_lost_fraction":0.25,"political_dm":-1}', -1, 0),
  (10, 'Crime Wave (Severe)',
       'Impose penalty unless Impossible Investigation/Psychology/Streetwise succeeds',
       '{"all_output_dm":-2,"political_dm":-2}', -2, 2),
  (11, 'Crime Wave (Moderate)',
       'Impose penalty unless Formidable Investigation/Psychology/Streetwise succeeds',
       '{"all_output_dm":-1,"political_dm":-1}', -1, 1),
  (12, 'Local Carnivore Rampage',
       'Deaths; impose penalty unless Impossible Tracking+Hunting succeeds',
       '{"all_output_dm":-2,"political_dm":-2}', -2, 1),
  (13, 'Indigenous Animal Stampede',
       '1D20 units of agricultural capital destroyed',
       '{"capital_units_destroyed":10,"capital_sector":"ag","political_dm":-1}', -1, 0),
  (14, 'Crime Wave (Armed)',
       'Impose penalty unless Formidable Tracking+Combat succeeds',
       '{"all_output_dm":-1,"political_dm":-1}', -1, 1),
  (15, 'No Traders',
       'No exports sold this turn; rations set aside for export spoil',
       '{"political_dm":0}', 0, 0),
  (16, 'Friendly Starship Visit',
       'Referee discretion — no mechanical effect coded',
       '{}', 0, 0),
  (17, 'Tasty Local Lifeform Discovered',
       'Permanent +1 to all future agricultural output rolls',
       '{"permanent_ag_roll_bonus":1,"political_dm":1}', 1, 0),
  (18, 'Local Edible Lifeform Population Boom',
       '+4 DM on agricultural output roll this month only',
       '{"ag_output_dm":4,"political_dm":1}', 1, 0),
  (19, 'Hardy Prolific Local Lifeform',
       'Permanent +2 to all future agricultural output rolls',
       '{"permanent_ag_roll_bonus":2,"political_dm":2}', 2, 0),
  (20, 'Edible Lifeform Population Explosion',
       'Agricultural output doubled this month only',
       '{"ag_output_dm":99,"political_dm":2}', 2, 0);

-- ── Weather outcomes (WTH Ch.5) ───────────────────────────────────────────────
-- Adjusted D20 (D20 + weather_factor) → outcome.
-- Thresholds derived from WTH distribution: most rolls produce No Effect.
INSERT OR IGNORE INTO ref_weather_outcomes VALUES
  (1, -999, 14, 'none'),
  (2,   15, 17, 'drought'),
  (3,   18, 19, 'severe_storm'),
  (4,   20, 999,'catastrophic_storm');
