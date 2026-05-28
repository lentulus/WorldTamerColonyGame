import { getDb } from './colony.js';
import type { Colony, ColonyTurn, FoundColonyRequest, WorldCandidate } from '@worldtamer/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

export class ColonyConflictError extends Error {}

export function getSlBaseline(homeTl: number): number {
  const row = getDb().prepare(
    `SELECT value_cr FROM ref_sl_starting_value
     WHERE tl_lo <= ? AND tl_hi >= ? LIMIT 1`
  ).get(homeTl, homeTl) as { value_cr: number } | undefined;
  return row?.value_cr ?? 250;
}

// ── createColony ──────────────────────────────────────────────────────────────

export function createColony(
  req: FoundColonyRequest,
  world: WorldCandidate,
  weatherFactor: number,
  phiMin: number,
): number {
  const db = getDb();

  const existing = db.prepare(
    'SELECT id FROM colonies WHERE body_id = ?'
  ).get(req.body_id);
  if (existing) throw new ColonyConflictError('A colony already exists on this world');

  const totalLaborers = req.al + req.il + req.ml + req.afl;
  const slBaseline    = getSlBaseline(req.home_tl);

  const sn = totalLaborers > 0 ? req.rations / totalLaborers : 0;
  const ss = totalLaborers > 0 ? req.housing_m3 / totalLaborers : 0;
  const sl = 1.0;

  const colResult = db.prepare(`
    INSERT INTO colonies (
      name, system_name, body_id, world_type, atmosphere_code,
      hydrographics_code, axial_tilt_deg, star_spectral, orbit_au, rvm, habitability,
      tech_level, founded_month, current_month,
      home_tl, acclimatization_stage, political_track,
      weather_factor, phi_min, ag_output_roll_bonus,
      road_network_cr_spent, transport_lines
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, 0, 0,
      ?, 1, 1,
      ?, ?, 0,
      0, '[]'
    )
  `).run(
    req.name.trim(), world.system_name, req.body_id, world.world_type, world.atmosphere_code,
    world.hydrographics_code, world.axial_tilt_deg, world.star_spectral, world.orbit_au,
    world.rvm, world.habitability,
    req.tech_level,
    req.home_tl,
    weatherFactor, phiMin,
  );

  const colonyId = Number(colResult.lastInsertRowid);

  db.prepare(`
    INSERT INTO colony_turns (
      colony_id, month,
      total_laborers, al, il, ml, afl,
      ac, ic_light, ic_heavy, ic_construction, mc, power_kw,
      rations, raw_materials_t, housing_m3, sl_value_per_person, debt_cr,
      sn, ss, sl,
      political_track,
      infrastructure_efficiency, maintenance_cost_cr
    ) VALUES (
      ?, 0,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      1,
      1.0, 0
    )
  `).run(
    colonyId,
    totalLaborers, req.al, req.il, req.ml, req.afl,
    req.ac, req.ic_light, req.ic_heavy, req.ic_construction, req.mc, req.power_kw,
    req.rations, req.raw_materials_t, req.housing_m3, slBaseline, req.debt_cr,
    sn, ss, sl,
  );

  return colonyId;
}

// ── getColony ─────────────────────────────────────────────────────────────────

export function getColony(id: number): { colony: Colony; turn: ColonyTurn } | null {
  const db = getDb();

  const colRow = db.prepare(
    'SELECT * FROM colonies WHERE id = ?'
  ).get(id) as Record<string, unknown> | undefined;
  if (!colRow) return null;

  const turnRow = db.prepare(
    'SELECT * FROM colony_turns WHERE colony_id = ? ORDER BY month DESC LIMIT 1'
  ).get(id) as Record<string, unknown> | undefined;
  if (!turnRow) return null;

  const colony: Colony = {
    id:                    Number(colRow.id),
    name:                  String(colRow.name),
    system_name:           String(colRow.system_name),
    body_id:               String(colRow.body_id),
    world_type:            String(colRow.world_type),
    atmosphere_code:       String(colRow.atmosphere_code),
    hydrographics_code:    Number(colRow.hydrographics_code),
    axial_tilt_deg:        Number(colRow.axial_tilt_deg),
    star_spectral:         String(colRow.star_spectral),
    orbit_au:              Number(colRow.orbit_au),
    rvm:                   Number(colRow.rvm),
    habitability:          Number(colRow.habitability),
    tech_level:            Number(colRow.tech_level),
    founded_month:         Number(colRow.founded_month),
    current_month:         Number(colRow.current_month),
    home_tl:               Number(colRow.home_tl),
    acclimatization_stage: Number(colRow.acclimatization_stage),
    political_track:       Number(colRow.political_track),
    weather_factor:        Number(colRow.weather_factor),
    phi_min:               Number(colRow.phi_min),
    ag_output_roll_bonus:  Number(colRow.ag_output_roll_bonus),
    road_network_cr_spent: Number(colRow.road_network_cr_spent),
    transport_lines:       JSON.parse(String(colRow.transport_lines ?? '[]')),
  };

  const turn: ColonyTurn = {
    colony_id:      Number(turnRow.colony_id),
    month:          Number(turnRow.month),
    total_laborers: Number(turnRow.total_laborers),
    al:  Number(turnRow.al),
    il:  Number(turnRow.il),
    ml:  Number(turnRow.ml),
    afl: Number(turnRow.afl),
    ac:             Number(turnRow.ac),
    ic_light:       Number(turnRow.ic_light),
    ic_heavy:       Number(turnRow.ic_heavy),
    ic_construction: Number(turnRow.ic_construction),
    mc:             Number(turnRow.mc),
    power_kw:       Number(turnRow.power_kw),
    rations:        Number(turnRow.rations),
    raw_materials_t: Number(turnRow.raw_materials_t),
    housing_m3:     Number(turnRow.housing_m3),
    sl_value_per_person: Number(turnRow.sl_value_per_person),
    debt_cr:        Number(turnRow.debt_cr),
    sn: Number(turnRow.sn),
    ss: Number(turnRow.ss),
    sl: Number(turnRow.sl),
    political_track: Number(turnRow.political_track),
    weather_roll:    turnRow.weather_roll    != null ? Number(turnRow.weather_roll)    : null,
    weather_dm:      turnRow.weather_dm      != null ? Number(turnRow.weather_dm)      : null,
    weather_outcome: turnRow.weather_outcome != null ? String(turnRow.weather_outcome) as any : null,
    random_event_roll: turnRow.random_event_roll != null ? Number(turnRow.random_event_roll) : null,
    political_roll:  turnRow.political_roll  != null ? Number(turnRow.political_roll)  : null,
    political_dm:    turnRow.political_dm    != null ? Number(turnRow.political_dm)    : null,
    political_outcome: turnRow.political_outcome != null ? String(turnRow.political_outcome) : null,
    ag_output_roll:  turnRow.ag_output_roll  != null ? Number(turnRow.ag_output_roll)  : null,
    ag_output_dm:    turnRow.ag_output_dm    != null ? Number(turnRow.ag_output_dm)    : null,
    ag_output_mult:  turnRow.ag_output_mult  != null ? Number(turnRow.ag_output_mult)  : null,
    ind_output_roll: turnRow.ind_output_roll != null ? Number(turnRow.ind_output_roll) : null,
    ind_output_dm:   turnRow.ind_output_dm   != null ? Number(turnRow.ind_output_dm)   : null,
    ind_output_mult: turnRow.ind_output_mult != null ? Number(turnRow.ind_output_mult) : null,
    mat_output_roll: turnRow.mat_output_roll != null ? Number(turnRow.mat_output_roll) : null,
    mat_output_dm:   turnRow.mat_output_dm   != null ? Number(turnRow.mat_output_dm)   : null,
    mat_output_mult: turnRow.mat_output_mult != null ? Number(turnRow.mat_output_mult) : null,
    q_a: turnRow.q_a != null ? Number(turnRow.q_a) : null,
    q_i: turnRow.q_i != null ? Number(turnRow.q_i) : null,
    q_m: turnRow.q_m != null ? Number(turnRow.q_m) : null,
    infrastructure_efficiency: Number(turnRow.infrastructure_efficiency),
    maintenance_cost_cr:       Number(turnRow.maintenance_cost_cr),
  };

  return { colony, turn };
}
