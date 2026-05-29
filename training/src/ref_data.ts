// WTH reference tables — transcribed verbatim from supporting/sql/seed.sql.
// No DB connection needed at training time.

export interface OutputRollRow  { roll_lo: number; roll_hi: number; multiplier: number }
export interface WeatherRow     { roll_lo: number; roll_hi: number; outcome: string }
export interface PoliticalRow   {
  roll_lo: number; roll_hi: number;
  event_label: string;
  output_dm: number;
  affected_sectors: string;  // 'all' | 'mat_ind' | 'one_random' | 'none'
  track_movement: number;
}
export interface SnRow          { sn_lo: number; sn_hi: number; output_dm: number; political_dm: number }
export interface SsRow          { ss_lo: number; ss_hi: number; political_dm: number }
export interface SlStartRow     { tl_lo: number; tl_hi: number; value_cr: number }
export interface AgRow          {
  tl: number; ac_cost_cr: number; rm_t_per_month: number;
  land_km2_per_al: number; base_output_rations: number;
}
export interface IndRow         {
  tl: number; light_ic_cost_cr: number; heavy_ic_cost_cr: number;
  construction_ic_cost_cr: number; kw_per_unit: number;
  rm_t_per_month: number; output_cr_per_il_month: number;
}
export interface MatRow         { tl: number; mc_cost_cr: number; kw_per_unit: number; base_output_t_per_month: number }
export interface TransportRow   { tl: number; line_load_mt_per_month: number; cost_mcr_per_km: number }
export interface RandomEventRow {
  roll: number; event_label: string; description: string;
  effects: string;         // JSON EventEffects template
  political_dm: number;
  duration_months: number;
}

export interface RefData {
  outputRoll:   OutputRollRow[];
  weather:      WeatherRow[];
  political:    PoliticalRow[];
  sn:           SnRow[];
  ss:           SsRow[];
  slStart:      SlStartRow[];
  agriculture:  AgRow[];
  industry:     IndRow[];
  materials:    MatRow[];
  transport:    TransportRow[];
  randomEvents: RandomEventRow[];
}

export const REF: RefData = {

  // ── ref_output_roll (WTH Ch.5) ─────────────────────────────────────────────
  outputRoll: [
    { roll_lo:  1, roll_hi:  1, multiplier: 0.80 },
    { roll_lo:  2, roll_hi:  3, multiplier: 0.85 },
    { roll_lo:  4, roll_hi:  5, multiplier: 0.90 },
    { roll_lo:  6, roll_hi:  7, multiplier: 0.95 },
    { roll_lo:  8, roll_hi: 13, multiplier: 1.00 },
    { roll_lo: 14, roll_hi: 15, multiplier: 1.05 },
    { roll_lo: 16, roll_hi: 17, multiplier: 1.10 },
    { roll_lo: 18, roll_hi: 19, multiplier: 1.15 },
    { roll_lo: 20, roll_hi: 99, multiplier: 1.20 },
  ],

  // ── ref_weather_outcomes (WTH Ch.5) ────────────────────────────────────────
  weather: [
    { roll_lo: -999, roll_hi:  14, outcome: 'none'              },
    { roll_lo:   15, roll_hi:  17, outcome: 'drought'           },
    { roll_lo:   18, roll_hi:  19, outcome: 'severe_storm'      },
    { roll_lo:   20, roll_hi: 999, outcome: 'catastrophic_storm'},
  ],

  // ── ref_political_table (WTH Ch.5) ─────────────────────────────────────────
  political: [
    { roll_lo: -999, roll_hi:  -5, event_label: 'Coup Attempt',          output_dm: -5, affected_sectors: 'all',        track_movement: -2 },
    { roll_lo:   -4, roll_hi:  -4, event_label: 'Severe Riots',          output_dm: -4, affected_sectors: 'all',        track_movement: -2 },
    { roll_lo:   -3, roll_hi:  -3, event_label: 'Assassination Attempt', output_dm: -4, affected_sectors: 'all',        track_movement: -1 },
    { roll_lo:   -2, roll_hi:  -2, event_label: 'Severe Riots',          output_dm: -3, affected_sectors: 'all',        track_movement: -1 },
    { roll_lo:   -1, roll_hi:  -1, event_label: 'Strikes',               output_dm: -3, affected_sectors: 'mat_ind',   track_movement: -1 },
    { roll_lo:    0, roll_hi:   0, event_label: 'Riots',                 output_dm: -2, affected_sectors: 'all',        track_movement:  0 },
    { roll_lo:    1, roll_hi:   1, event_label: 'Riots',                 output_dm: -2, affected_sectors: 'all',        track_movement:  0 },
    { roll_lo:    2, roll_hi:   3, event_label: 'Boycotts/Slowdowns',    output_dm: -2, affected_sectors: 'one_random', track_movement:  0 },
    { roll_lo:    4, roll_hi:   5, event_label: 'Dissatisfaction',       output_dm: -1, affected_sectors: 'one_random', track_movement:  0 },
    { roll_lo:    6, roll_hi:  15, event_label: 'No Effect',             output_dm:  0, affected_sectors: 'none',       track_movement:  0 },
    { roll_lo:   16, roll_hi:  19, event_label: 'Productive',            output_dm: +1, affected_sectors: 'one_random', track_movement:  0 },
    { roll_lo:   20, roll_hi:  21, event_label: 'Productive',            output_dm: +1, affected_sectors: 'all',        track_movement:  0 },
    { roll_lo:   22, roll_hi:  23, event_label: 'Very Productive',       output_dm: +1, affected_sectors: 'all',        track_movement: +1 },
    { roll_lo:   24, roll_hi:  24, event_label: 'Very Productive',       output_dm: +2, affected_sectors: 'all',        track_movement: +1 },
    { roll_lo:   25, roll_hi: 999, event_label: 'Excellent',             output_dm: +2, affected_sectors: 'all',        track_movement: +2 },
  ],

  // ── ref_sn_table (WTH Ch.4) ────────────────────────────────────────────────
  sn: [
    { sn_lo:  0.00, sn_hi:  0.44, output_dm: -8, political_dm: -4 },
    { sn_lo:  0.45, sn_hi:  0.54, output_dm: -8, political_dm: -4 },
    { sn_lo:  0.55, sn_hi:  0.64, output_dm: -5, political_dm: -3 },
    { sn_lo:  0.65, sn_hi:  0.74, output_dm: -3, political_dm: -2 },
    { sn_lo:  0.75, sn_hi:  0.84, output_dm: -2, political_dm: -1 },
    { sn_lo:  0.85, sn_hi:  0.94, output_dm: -1, political_dm: -1 },
    { sn_lo:  0.95, sn_hi:  1.19, output_dm:  0, political_dm:  0 },
    { sn_lo:  1.20, sn_hi:  2.00, output_dm:  0, political_dm: +1 },
    { sn_lo:  2.10, sn_hi:  3.00, output_dm:  0, political_dm: +2 },
    { sn_lo:  3.10, sn_hi:  6.00, output_dm:  0, political_dm: +3 },
    { sn_lo:  6.10, sn_hi: 10.00, output_dm:  0, political_dm: +4 },
    { sn_lo: 10.10, sn_hi: 999.0, output_dm:  0, political_dm: +5 },
  ],

  // ── ref_ss_table (WTH Ch.4) ────────────────────────────────────────────────
  ss: [
    { ss_lo:    0, ss_hi:   24, political_dm: -3 },
    { ss_lo:   25, ss_hi:   50, political_dm: -2 },
    { ss_lo:   51, ss_hi:   80, political_dm: -1 },
    { ss_lo:   81, ss_hi:  120, political_dm:  0 },
    { ss_lo:  121, ss_hi:  160, political_dm: +1 },
    { ss_lo:  161, ss_hi:  250, political_dm: +2 },
    { ss_lo:  251, ss_hi:  350, political_dm: +3 },
    { ss_lo:  351, ss_hi: 9999, political_dm: +4 },
  ],

  // ── ref_sl_starting_value (WTH Ch.4) ───────────────────────────────────────
  slStart: [
    { tl_lo:  0, tl_hi:  3, value_cr:    5 },
    { tl_lo:  4, tl_hi:  5, value_cr:   50 },
    { tl_lo:  6, tl_hi:  8, value_cr:  250 },
    { tl_lo:  9, tl_hi: 10, value_cr:  500 },
    { tl_lo: 11, tl_hi: 13, value_cr: 1500 },
    { tl_lo: 14, tl_hi: 16, value_cr: 2500 },
  ],

  // ── ref_agriculture_tl (WTH Ch.4) ──────────────────────────────────────────
  agriculture: [
    { tl:  0, ac_cost_cr:     0, rm_t_per_month:  0, land_km2_per_al: 0.10, base_output_rations:  2 },
    { tl:  1, ac_cost_cr:   300, rm_t_per_month:  0, land_km2_per_al: 0.15, base_output_rations:  3 },
    { tl:  2, ac_cost_cr:   800, rm_t_per_month:  0, land_km2_per_al: 0.20, base_output_rations:  4 },
    { tl:  3, ac_cost_cr:  1500, rm_t_per_month:  0, land_km2_per_al: 0.30, base_output_rations:  6 },
    { tl:  4, ac_cost_cr:  2400, rm_t_per_month:  1, land_km2_per_al: 0.40, base_output_rations:  9 },
    { tl:  5, ac_cost_cr:  4000, rm_t_per_month:  2, land_km2_per_al: 0.50, base_output_rations: 12 },
    { tl:  6, ac_cost_cr:  6000, rm_t_per_month:  4, land_km2_per_al: 0.60, base_output_rations: 15 },
    { tl:  7, ac_cost_cr:  9800, rm_t_per_month:  6, land_km2_per_al: 0.70, base_output_rations: 21 },
    { tl:  8, ac_cost_cr: 14400, rm_t_per_month:  8, land_km2_per_al: 0.80, base_output_rations: 27 },
    { tl:  9, ac_cost_cr: 18000, rm_t_per_month: 10, land_km2_per_al: 0.90, base_output_rations: 33 },
    { tl: 10, ac_cost_cr: 21000, rm_t_per_month: 12, land_km2_per_al: 1.00, base_output_rations: 39 },
    { tl: 11, ac_cost_cr: 24200, rm_t_per_month: 14, land_km2_per_al: 1.10, base_output_rations: 45 },
    { tl: 12, ac_cost_cr: 27600, rm_t_per_month: 16, land_km2_per_al: 1.00, base_output_rations: 52 },
    { tl: 13, ac_cost_cr: 31200, rm_t_per_month: 14, land_km2_per_al: 0.80, base_output_rations: 60 },
    { tl: 14, ac_cost_cr: 35000, rm_t_per_month: 12, land_km2_per_al: 0.60, base_output_rations: 68 },
    { tl: 15, ac_cost_cr: 39000, rm_t_per_month: 10, land_km2_per_al: 0.40, base_output_rations: 75 },
  ],

  // ── ref_industry_tl (WTH Ch.4) ─────────────────────────────────────────────
  industry: [
    { tl:  0, light_ic_cost_cr:     5, heavy_ic_cost_cr:     15, construction_ic_cost_cr:     2.5, kw_per_unit: 0.0, rm_t_per_month:  0.1, output_cr_per_il_month:   50 },
    { tl:  1, light_ic_cost_cr:    10, heavy_ic_cost_cr:     30, construction_ic_cost_cr:     5.0, kw_per_unit: 0.0, rm_t_per_month:  0.2, output_cr_per_il_month:   75 },
    { tl:  2, light_ic_cost_cr:    15, heavy_ic_cost_cr:     45, construction_ic_cost_cr:     7.5, kw_per_unit: 0.0, rm_t_per_month:  0.3, output_cr_per_il_month:  100 },
    { tl:  3, light_ic_cost_cr:   150, heavy_ic_cost_cr:    450, construction_ic_cost_cr:    75.0, kw_per_unit: 0.1, rm_t_per_month:  1.0, output_cr_per_il_month:  200 },
    { tl:  4, light_ic_cost_cr:   500, heavy_ic_cost_cr:   1500, construction_ic_cost_cr:   250.0, kw_per_unit: 0.2, rm_t_per_month:  4.0, output_cr_per_il_month:  300 },
    { tl:  5, light_ic_cost_cr:  1350, heavy_ic_cost_cr:   4050, construction_ic_cost_cr:   675.0, kw_per_unit: 0.3, rm_t_per_month:  7.0, output_cr_per_il_month:  500 },
    { tl:  6, light_ic_cost_cr:  3000, heavy_ic_cost_cr:   9000, construction_ic_cost_cr:  1500.0, kw_per_unit: 0.4, rm_t_per_month: 15.0, output_cr_per_il_month:  750 },
    { tl:  7, light_ic_cost_cr:  6500, heavy_ic_cost_cr:  19500, construction_ic_cost_cr:  3250.0, kw_per_unit: 0.8, rm_t_per_month: 30.0, output_cr_per_il_month: 1000 },
    { tl:  8, light_ic_cost_cr: 11000, heavy_ic_cost_cr:  33000, construction_ic_cost_cr:  5500.0, kw_per_unit: 1.2, rm_t_per_month: 45.0, output_cr_per_il_month: 1500 },
    { tl:  9, light_ic_cost_cr: 15000, heavy_ic_cost_cr:  45000, construction_ic_cost_cr:  7500.0, kw_per_unit: 1.5, rm_t_per_month: 55.0, output_cr_per_il_month: 2000 },
    { tl: 10, light_ic_cost_cr: 20000, heavy_ic_cost_cr:  60000, construction_ic_cost_cr: 10000.0, kw_per_unit: 1.8, rm_t_per_month: 65.0, output_cr_per_il_month: 2500 },
    { tl: 11, light_ic_cost_cr: 24000, heavy_ic_cost_cr:  72000, construction_ic_cost_cr: 12000.0, kw_per_unit: 2.0, rm_t_per_month: 70.0, output_cr_per_il_month: 3000 },
    { tl: 12, light_ic_cost_cr: 28000, heavy_ic_cost_cr:  84000, construction_ic_cost_cr: 14000.0, kw_per_unit: 2.2, rm_t_per_month: 75.0, output_cr_per_il_month: 3500 },
    { tl: 13, light_ic_cost_cr: 32000, heavy_ic_cost_cr:  96000, construction_ic_cost_cr: 16000.0, kw_per_unit: 2.4, rm_t_per_month: 80.0, output_cr_per_il_month: 4000 },
    { tl: 14, light_ic_cost_cr: 37000, heavy_ic_cost_cr: 111000, construction_ic_cost_cr: 18500.0, kw_per_unit: 2.6, rm_t_per_month: 85.0, output_cr_per_il_month: 4500 },
    { tl: 15, light_ic_cost_cr: 42000, heavy_ic_cost_cr: 126000, construction_ic_cost_cr: 21000.0, kw_per_unit: 2.8, rm_t_per_month: 90.0, output_cr_per_il_month: 5000 },
  ],

  // ── ref_materials_tl (WTH Ch.4) ────────────────────────────────────────────
  materials: [
    { tl:  0, mc_cost_cr:    0.5, kw_per_unit: 0.0, base_output_t_per_month:   1 },
    { tl:  1, mc_cost_cr:    1.0, kw_per_unit: 0.0, base_output_t_per_month:   2 },
    { tl:  2, mc_cost_cr:    1.5, kw_per_unit: 0.0, base_output_t_per_month:   3 },
    { tl:  3, mc_cost_cr:   15.0, kw_per_unit: 0.1, base_output_t_per_month:  10 },
    { tl:  4, mc_cost_cr:   50.0, kw_per_unit: 0.2, base_output_t_per_month:  40 },
    { tl:  5, mc_cost_cr:  135.0, kw_per_unit: 0.3, base_output_t_per_month:  70 },
    { tl:  6, mc_cost_cr:  300.0, kw_per_unit: 0.4, base_output_t_per_month: 150 },
    { tl:  7, mc_cost_cr:  650.0, kw_per_unit: 0.8, base_output_t_per_month: 300 },
    { tl:  8, mc_cost_cr: 1100.0, kw_per_unit: 1.2, base_output_t_per_month: 450 },
    { tl:  9, mc_cost_cr: 1500.0, kw_per_unit: 1.5, base_output_t_per_month: 550 },
    { tl: 10, mc_cost_cr: 2000.0, kw_per_unit: 1.8, base_output_t_per_month: 650 },
    { tl: 11, mc_cost_cr: 2400.0, kw_per_unit: 2.0, base_output_t_per_month: 700 },
    { tl: 12, mc_cost_cr: 2800.0, kw_per_unit: 2.2, base_output_t_per_month: 750 },
    { tl: 13, mc_cost_cr: 3200.0, kw_per_unit: 2.4, base_output_t_per_month: 800 },
    { tl: 14, mc_cost_cr: 3700.0, kw_per_unit: 2.6, base_output_t_per_month: 850 },
    { tl: 15, mc_cost_cr: 4200.0, kw_per_unit: 2.8, base_output_t_per_month: 900 },
  ],

  // ── ref_transport_tl (WTH Ch.4) ────────────────────────────────────────────
  transport: [
    { tl: 0, line_load_mt_per_month:  0.1, cost_mcr_per_km: 0.0005 },
    { tl: 1, line_load_mt_per_month:  0.5, cost_mcr_per_km: 0.0010 },
    { tl: 2, line_load_mt_per_month:  1.0, cost_mcr_per_km: 0.0015 },
    { tl: 3, line_load_mt_per_month:  4.0, cost_mcr_per_km: 0.0030 },
    { tl: 4, line_load_mt_per_month:  6.0, cost_mcr_per_km: 0.0040 },
    { tl: 5, line_load_mt_per_month:  8.0, cost_mcr_per_km: 0.0050 },
    { tl: 6, line_load_mt_per_month: 10.0, cost_mcr_per_km: 0.0060 },
    { tl: 7, line_load_mt_per_month: 15.0, cost_mcr_per_km: 0.0080 },
    { tl: 8, line_load_mt_per_month: 30.0, cost_mcr_per_km: 0.0100 },
  ],

  // ── ref_random_events (WTH Ch.5) ───────────────────────────────────────────
  randomEvents: [
    { roll:  1, event_label: 'Severe Plague',                    duration_months: 3, political_dm: -2, description: '1D10 deaths/day until Impossible Medical (Diagnosis) task succeeds',           effects: '{"all_output_dm":-4,"political_dm":-2}'                         },
    { roll:  2, event_label: 'Severe Livestock Disease',          duration_months: 3, political_dm: -2, description: 'Agricultural output halved until Impossible Medical/Vet task succeeds',       effects: '{"ag_output_dm":-99,"political_dm":-2}'                         },
    { roll:  3, event_label: 'Moderate Plague',                   duration_months: 2, political_dm: -2, description: '1D6 deaths/day until Formidable Medical (Diagnosis) task succeeds',           effects: '{"all_output_dm":-2,"political_dm":-2}'                         },
    { roll:  4, event_label: 'Moderate Livestock Disease',        duration_months: 2, political_dm: -1, description: 'Agricultural output reduced 25% until Formidable Medical/Vet task succeeds',  effects: '{"ag_output_dm":-2,"political_dm":-1}'                          },
    { roll:  5, event_label: 'Hostile Starship Visit',            duration_months: 0, political_dm:  0, description: 'Referee discretion — no mechanical effect coded',                             effects: '{}'                                                            },
    { roll:  6, event_label: 'Vermin Eat Rations (Major)',        duration_months: 0, political_dm: -2, description: 'Up to 50% of stored rations consumed by vermin',                             effects: '{"rations_lost_fraction":0.50,"political_dm":-2}'              },
    { roll:  7, event_label: 'Crop Blight',                       duration_months: 0, political_dm: -2, description: 'Agricultural output halved this turn',                                       effects: '{"ag_output_dm":-99,"political_dm":-2}'                         },
    { roll:  8, event_label: 'Earthquake',                        duration_months: 0, political_dm: -1, description: 'Up to 10% of housing destroyed',                                             effects: '{"housing_lost_fraction":0.10,"political_dm":-1}'               },
    { roll:  9, event_label: 'Vermin Eat Rations (Minor)',        duration_months: 0, political_dm: -1, description: 'Up to 25% of stored rations consumed by vermin',                             effects: '{"rations_lost_fraction":0.25,"political_dm":-1}'              },
    { roll: 10, event_label: 'Crime Wave (Severe)',               duration_months: 2, political_dm: -2, description: 'Impose penalty unless Impossible Investigation/Psychology/Streetwise succeeds', effects: '{"all_output_dm":-2,"political_dm":-2}'                        },
    { roll: 11, event_label: 'Crime Wave (Moderate)',             duration_months: 1, political_dm: -1, description: 'Impose penalty unless Formidable Investigation/Psychology/Streetwise succeeds', effects: '{"all_output_dm":-1,"political_dm":-1}'                        },
    { roll: 12, event_label: 'Local Carnivore Rampage',           duration_months: 1, political_dm: -2, description: 'Deaths; impose penalty unless Impossible Tracking+Hunting succeeds',          effects: '{"all_output_dm":-2,"political_dm":-2}'                         },
    { roll: 13, event_label: 'Indigenous Animal Stampede',        duration_months: 0, political_dm: -1, description: '1D20 units of agricultural capital destroyed',                               effects: '{"capital_units_destroyed":10,"capital_sector":"ag","political_dm":-1}' },
    { roll: 14, event_label: 'Crime Wave (Armed)',                duration_months: 1, political_dm: -1, description: 'Impose penalty unless Formidable Tracking+Combat succeeds',                   effects: '{"all_output_dm":-1,"political_dm":-1}'                         },
    { roll: 15, event_label: 'No Traders',                        duration_months: 0, political_dm:  0, description: 'No exports sold this turn; rations set aside for export spoil',              effects: '{"political_dm":0}'                                            },
    { roll: 16, event_label: 'Friendly Starship Visit',           duration_months: 0, political_dm:  0, description: 'Referee discretion — no mechanical effect coded',                             effects: '{}'                                                            },
    { roll: 17, event_label: 'Tasty Local Lifeform Discovered',   duration_months: 0, political_dm: +1, description: 'Permanent +1 to all future agricultural output rolls',                       effects: '{"permanent_ag_roll_bonus":1,"political_dm":1}'                 },
    { roll: 18, event_label: 'Local Edible Lifeform Pop. Boom',   duration_months: 0, political_dm: +1, description: '+4 DM on agricultural output roll this month only',                          effects: '{"ag_output_dm":4,"political_dm":1}'                            },
    { roll: 19, event_label: 'Hardy Prolific Local Lifeform',     duration_months: 0, political_dm: +2, description: 'Permanent +2 to all future agricultural output rolls',                       effects: '{"permanent_ag_roll_bonus":2,"political_dm":2}'                 },
    { roll: 20, event_label: 'Edible Lifeform Population Explosion', duration_months: 0, political_dm: +2, description: 'Agricultural output doubled this month only',                            effects: '{"ag_output_dm":99,"political_dm":2}'                           },
  ],

};
