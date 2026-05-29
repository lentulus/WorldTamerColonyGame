// ── World / Meridian ──────────────────────────────────────────────────────────

export interface WorldCandidate {
  body_id: string;
  system_id: string;
  system_name: string;
  body_position: number;    // 1-based ordinal within system by orbit (e.g. 3 = "Sol 3")
  world_type: string;
  atmosphere_code: string;
  hydrographics_code: number;
  axial_tilt_deg: number;
  tidally_locked: boolean;
  star_spectral: string;
  orbit_au: number;
  rvm: number;
  habitability: number;
  dist_pc: number;
}

export interface WorldListParams {
  center_x_pc?: number;
  center_y_pc?: number;
  center_z_pc?: number;
  max_dist_pc: number;      // required — prevents unbounded scans
  min_habitability?: number;
  limit?: number;
  offset?: number;
}

// ── Colony master ─────────────────────────────────────────────────────────────

export interface Colony {
  id: number;
  name: string;
  system_name: string;
  body_id: string;
  world_type: string;
  atmosphere_code: string;
  hydrographics_code: number;
  axial_tilt_deg: number;
  star_spectral: string;
  orbit_au: number;
  rvm: number;
  habitability: number;
  tech_level: number;
  founded_month: number;
  current_month: number;
  home_tl: number;
  acclimatization_stage: number;  // 1–5
  political_track: number;        // −3…+3
  weather_factor: number;
  phi_min: number;
  ag_output_roll_bonus: number;
  road_network_cr_spent: number;
  transport_lines: TransportLine[];
}

export interface TransportLine {
  from_hex: string;
  to_hex: string;
  capacity_mt_per_month: number;
  length_km: number;
}

// ── Turn snapshot ─────────────────────────────────────────────────────────────

export interface ColonyTurn {
  colony_id: number;
  month: number;
  // Population (laborers; 1 laborer ≈ 4 people including dependants)
  total_laborers: number;
  al: number;
  il: number;
  ml: number;
  afl: number;
  // Capital
  ac: number;
  ic_light: number;
  ic_heavy: number;
  ic_construction: number;
  mc: number;
  power_kw: number;
  // Stockpiles
  rations: number;
  raw_materials_t: number;
  housing_m3: number;
  sl_value_per_person: number;
  debt_cr: number;
  // Satisfaction indices (computed this turn; applied as DMs next turn)
  sn: number;
  ss: number;
  sl: number;
  // Political
  political_track: number;
  // Roll results (null for founding month 0)
  weather_roll: number | null;
  weather_dm: number | null;
  weather_outcome: WeatherOutcome | null;
  random_event_roll: number | null;
  political_roll: number | null;
  political_dm: number | null;
  political_outcome: string | null;
  ag_output_roll: number | null;
  ag_output_dm: number | null;
  ag_output_mult: number | null;
  ind_output_roll: number | null;
  ind_output_dm: number | null;
  ind_output_mult: number | null;
  mat_output_roll: number | null;
  mat_output_dm: number | null;
  mat_output_mult: number | null;
  // Production
  q_a: number | null;
  q_i: number | null;
  q_m: number | null;
  // Infrastructure
  infrastructure_efficiency: number;
  maintenance_cost_cr: number;
}

export type WeatherOutcome = 'none' | 'drought' | 'severe_storm' | 'catastrophic_storm';

// ── Active events ─────────────────────────────────────────────────────────────

export interface ColonyEvent {
  id: number;
  colony_id: number;
  month: number;
  event_type: string;
  description: string;
  effects: EventEffects;
  active_until_month: number | null;
}

export interface EventEffects {
  ag_output_dm?: number;
  ind_output_dm?: number;
  mat_output_dm?: number;
  all_output_dm?: number;
  rations_lost_fraction?: number;
  housing_lost_fraction?: number;
  capital_units_destroyed?: number;
  capital_sector?: 'ag' | 'mat' | 'ind';
  political_dm?: number;
  permanent_ag_roll_bonus?: number;
}

// ── Turn finalization ─────────────────────────────────────────────────────────

export interface FinalizeRequest {
  al: number;
  il: number;
  ml: number;
  afl: number;
  // Optional capital purchases (unit counts); server validates cost ≤ to_capital_cr
  new_ac?: number;
  new_ic_light?: number;
  new_ic_heavy?: number;
  new_ic_construction?: number;
  new_mc?: number;
}

// ── Founding ──────────────────────────────────────────────────────────────────

export interface FoundColonyRequest {
  body_id: string;
  system_id: string;
  name: string;
  tech_level: number;
  home_tl: number;
  al: number;
  il: number;
  ml: number;
  afl: number;
  ac: number;
  ic_light: number;
  ic_heavy: number;
  ic_construction: number;
  mc: number;
  power_kw: number;
  rations: number;
  raw_materials_t: number;
  housing_m3: number;
  debt_cr: number;
}

// ── Turn resolution ───────────────────────────────────────────────────────────

export interface TurnResolution {
  colony_id: number;
  month: number;
  weather: {
    roll: number;
    dm: number;
    adjusted: number;
    outcome: WeatherOutcome;
    description: string;
  };
  random_event: {
    trigger_roll: number;
    triggered: boolean;
    event_roll: number | null;
    description: string | null;
    effects: EventEffects | null;
  };
  political: {
    roll: number;
    dm: number;
    adjusted: number;
    outcome: string;
    output_dm: number;
    track_movement: number;
    new_track: number;
  };
  output_rolls: {
    agriculture: { roll: number; dm: number; adjusted: number; multiplier: number };
    industry:    { roll: number; dm: number; adjusted: number; multiplier: number };
    materials:   { roll: number; dm: number; adjusted: number; multiplier: number };
  };
  active_event_dms: EventEffects;
  acclimatization: {
    old_stage: number;
    new_stage: number;
    roll: number;
    advanced: boolean;
    dm: number;
  };
  storm_damage: number;
  random_event_rations_lost: number;
  random_event_housing_lost: number;

  // Production quantities computed at turn/start (base output × dice multiplier)
  q_a: number;
  q_m: number;

  // Totals available for allocation (produced this turn + previous stockpile)
  rations_available: number;
  raw_materials_available: number;

  // Industrial production (computed at turn/start)
  q_i: number;

  // Filled in by the allocation endpoints
  rations_allocation?: RationAllocation;
  sn?: number;
  materials_allocation?: MaterialsAllocation;
  industrial_allocation?: IndustrialAllocation;
  ss?: number;
  sl_value?: number;
  sl_index?: number;
}

// ── Allocation requests ───────────────────────────────────────────────────────

export interface RationAllocation {
  to_population: number;
  to_stockpile: number;
  to_export: number;
  to_animals: number;
}

export interface MaterialsAllocation {
  to_agriculture: number;
  to_industry: number;
  to_energy: number;
  to_stockpile: number;
  to_export: number;
}

export interface IndustrialAllocation {
  to_capital_cr: number;
  to_housing_cr: number;
  to_consumer_goods_cr: number;
  to_armed_forces_cr: number;
  to_export_cr: number;
  to_road_network_cr: number;
}

export interface LaborAssignment {
  al: number;
  il: number;
  ml: number;
  afl: number;
}

// ── Reference table rows (used by server; shared for typing) ──────────────────

export interface AgricultureTL {
  tl: number;
  ac_cost_cr: number;
  rm_t_per_month: number;
  land_km2_per_al: number;
  base_output_rations: number;
}

export interface IndustryTL {
  tl: number;
  light_ic_cost_cr: number;
  heavy_ic_cost_cr: number;
  construction_ic_cost_cr: number;
  kw_per_unit: number;
  rm_t_per_month: number;
  output_cr_per_il_month: number;
}

export interface MaterialsTL {
  tl: number;
  mc_cost_cr: number;
  kw_per_unit: number;
  base_output_t_per_month: number;
}
