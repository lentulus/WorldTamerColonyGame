import { Hono } from 'hono';
import { getDb } from '../db/colony.js';
import {
  lookupOutputMultiplier,
  applyOutputDMs,
  lookupWeatherOutcome,
  lookupPoliticalOutcome,
} from '../engine/rolls.js';
import {
  computeM,
  computePhiT,
  computeQA,
  computeQI,
  computeQM,
  computePowerFactor,
  computeSN,
  computeSS,
  computeSLDecay,
  computeSLReplenishment,
  computeSLIndex,
} from '../engine/production.js';
import { getSlBaseline } from '../db/colonies.js';
import type {
  TurnResolution, EventEffects,
  RationAllocation, MaterialsAllocation, IndustrialAllocation,
} from '@worldtamer/shared';

const turns = new Hono();

function d20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

function snDMs(sn: number): { output_dm: number; political_dm: number } {
  const row = getDb().prepare(
    `SELECT output_dm, political_dm FROM ref_sn_table
     WHERE sn_lo <= ? AND sn_hi >= ? LIMIT 1`
  ).get(sn, sn) as { output_dm: number; political_dm: number } | undefined;
  return row ?? { output_dm: 0, political_dm: 0 };
}

function ssPoliticalDM(ss: number): number {
  const row = getDb().prepare(
    `SELECT political_dm FROM ref_ss_table
     WHERE ss_lo <= ? AND ss_hi >= ? LIMIT 1`
  ).get(ss, ss) as { political_dm: number } | undefined;
  return row?.political_dm ?? 0;
}

function acclimatizationDM(stage: number): number {
  return Math.min(0, stage - 5);
}

const WEATHER_DESCRIPTION: Record<string, string> = {
  none:               'Normal weather conditions.',
  drought:            'Drought — agricultural output is reduced.',
  severe_storm:       'Severe storm — capital and housing at risk.',
  catastrophic_storm: 'Catastrophic storm — major damage to colony infrastructure.',
};

// ── POST /api/colonies/:id/turn/start ─────────────────────────────────────────

turns.post('/:id/turn/start', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb();

  const colRow = db.prepare('SELECT * FROM colonies WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!colRow) return c.json({ error: 'Colony not found' }, 404);

  const prevTurn = db.prepare(`
    SELECT sn, ss, al, ac, il, ic_light, ic_heavy, ic_construction, ml, mc,
           power_kw, raw_materials_t, rations, total_laborers, infrastructure_efficiency,
           sl_value_per_person, housing_m3
    FROM colony_turns WHERE colony_id = ? ORDER BY month DESC LIMIT 1
  `).get(id) as Record<string, number> | undefined;

  const snDMValues   = snDMs(prevTurn?.sn ?? 1.0);
  const ssPolitDM    = ssPoliticalDM(prevTurn?.ss ?? 100);
  const acclDM       = acclimatizationDM(Number(colRow.acclimatization_stage));
  const politTrack   = Number(colRow.political_track);
  const weatherFactor = Number(colRow.weather_factor);
  const agBonus      = Number(colRow.ag_output_roll_bonus);
  const newMonth     = Number(colRow.current_month) + 1;

  // ── Step 1: Weather ───────────────────────────────────────────────────────
  const weatherRoll     = d20();
  const weatherDM       = weatherFactor;
  const weatherAdjusted = weatherRoll + weatherDM;
  const weatherOutcome  = lookupWeatherOutcome(weatherAdjusted);

  if (weatherOutcome !== 'none') {
    db.prepare(`
      INSERT INTO colony_events (colony_id, month, event_type, description, effects, active_until_month)
      VALUES (?, ?, 'weather', ?, '{}', NULL)
    `).run(id, newMonth, WEATHER_DESCRIPTION[weatherOutcome]);
  }

  // ── Step 1: Random event trigger ──────────────────────────────────────────
  const reTriggerRoll = d20();
  let reEventRoll: number | null = null;
  let reDescription: string | null = null;
  let reEffects: EventEffects | null = null;

  if (reTriggerRoll >= 16) {
    reEventRoll = d20();
    const reRow = db.prepare(
      `SELECT event_label, description, effects, duration_months
       FROM ref_random_events WHERE roll = ?`
    ).get(reEventRoll) as {
      event_label: string; description: string;
      effects: string; duration_months: number;
    } | undefined;

    if (reRow) {
      reDescription = `${reRow.event_label}: ${reRow.description}`;
      reEffects = JSON.parse(reRow.effects) as EventEffects;
      const activeUntil = reRow.duration_months > 0
        ? newMonth + reRow.duration_months - 1
        : null;
      db.prepare(`
        INSERT INTO colony_events (colony_id, month, event_type, description, effects, active_until_month)
        VALUES (?, ?, 'random', ?, ?, ?)
      `).run(id, newMonth, reRow.description, reRow.effects, activeUntil);
    }
  }

  // ── Step 1: Political roll ────────────────────────────────────────────────
  const politRoll     = d20();
  const politDM       = politTrack + snDMValues.political_dm + ssPolitDM;
  const politAdjusted = politRoll + politDM;
  const politOutcome  = lookupPoliticalOutcome(politAdjusted);
  const newPolitTrack = Math.max(-3, Math.min(3, politTrack + politOutcome.track_movement));

  db.prepare('UPDATE colonies SET political_track = ? WHERE id = ?')
    .run(newPolitTrack, id);

  // ── Step 2: Output rolls ──────────────────────────────────────────────────
  let agPolitDM = 0, indPolitDM = 0, matPolitDM = 0;
  switch (politOutcome.affected_sectors) {
    case 'all':
      agPolitDM = indPolitDM = matPolitDM = politOutcome.output_dm; break;
    case 'mat_ind':
      indPolitDM = matPolitDM = politOutcome.output_dm; break;
    case 'one_random': {
      const idx = Math.floor(Math.random() * 3);
      if (idx === 0) agPolitDM = politOutcome.output_dm;
      else if (idx === 1) indPolitDM = politOutcome.output_dm;
      else matPolitDM = politOutcome.output_dm;
      break;
    }
  }

  const agRoll = d20();
  const agDM   = applyOutputDMs(-1, agPolitDM, snDMValues.output_dm, acclDM) + agBonus;
  const agAdj  = agRoll + agDM;
  const agMult = lookupOutputMultiplier(agAdj);

  const indRoll = d20();
  const indDM   = applyOutputDMs(-1, indPolitDM, snDMValues.output_dm, acclDM);
  const indAdj  = indRoll + indDM;
  const indMult = lookupOutputMultiplier(indAdj);

  const matRoll = d20();
  const matDM   = applyOutputDMs(-1, matPolitDM, snDMValues.output_dm, acclDM);
  const matAdj  = matRoll + matDM;
  const matMult = lookupOutputMultiplier(matAdj);

  // ── Production computation ────────────────────────────────────────────────
  const tl = Number(colRow.tech_level);

  const agRef = db.prepare(
    'SELECT base_output_rations, rm_t_per_month FROM ref_agriculture_tl WHERE tl = ?'
  ).get(tl) as { base_output_rations: number; rm_t_per_month: number } | undefined
    ?? { base_output_rations: 0, rm_t_per_month: 0 };

  const indRef = db.prepare(
    'SELECT kw_per_unit, output_cr_per_il_month FROM ref_industry_tl WHERE tl = ?'
  ).get(tl) as { kw_per_unit: number; output_cr_per_il_month: number } | undefined
    ?? { kw_per_unit: 0, output_cr_per_il_month: 0 };

  const matRef = db.prepare(
    'SELECT base_output_t_per_month, kw_per_unit FROM ref_materials_tl WHERE tl = ?'
  ).get(tl) as { base_output_t_per_month: number; kw_per_unit: number } | undefined
    ?? { base_output_t_per_month: 0, kw_per_unit: 0 };

  const al  = prevTurn?.al  ?? 0;
  const ac  = prevTurn?.ac  ?? 0;
  const ml  = prevTurn?.ml  ?? 0;
  const mc  = prevTurn?.mc  ?? 0;
  const icTotal = (prevTurn?.ic_light ?? 0) + (prevTurn?.ic_heavy ?? 0) + (prevTurn?.ic_construction ?? 0);
  const powerKw = prevTurn?.power_kw ?? 0;
  const rawMat  = prevTurn?.raw_materials_t ?? 0;
  const rations = prevTurn?.rations ?? 0;
  const eta     = prevTurn?.infrastructure_efficiency ?? 1.0;

  const powerFactor = computePowerFactor(powerKw, icTotal, mc, indRef.kw_per_unit, matRef.kw_per_unit);

  const M_A = computeM(al, ac);
  const rmRequired = ac * agRef.rm_t_per_month;
  const R_A = rmRequired > 0 ? Math.min(1.0, rawMat / rmRequired) : 1.0;
  const orbitMonths = Math.pow(Number(colRow.orbit_au), 1.5) * 12;
  const phi = computePhiT(newMonth, orbitMonths, Number(colRow.phi_min));
  const q_a = computeQA(M_A, agRef.base_output_rations, R_A, phi, eta, powerFactor) * agMult;

  const M_M = computeM(ml, mc);
  const q_m = computeQM(M_M, matRef.base_output_t_per_month, Number(colRow.rvm), eta, powerFactor) * matMult;

  const il   = prevTurn?.il ?? 0;
  const M_I  = computeM(il, icTotal);
  const q_i  = computeQI(M_I, indRef.output_cr_per_il_month, eta, powerFactor) * indMult;

  const rations_available       = q_a + rations;
  const raw_materials_available = q_m + rawMat;

  // ── Build and persist TurnResolution ─────────────────────────────────────
  const resolution: TurnResolution = {
    colony_id: id,
    month: newMonth,
    weather: {
      roll: weatherRoll, dm: weatherDM,
      adjusted: weatherAdjusted, outcome: weatherOutcome,
      description: WEATHER_DESCRIPTION[weatherOutcome],
    },
    random_event: {
      trigger_roll: reTriggerRoll, triggered: reTriggerRoll >= 16,
      event_roll: reEventRoll, description: reDescription, effects: reEffects,
    },
    political: {
      roll: politRoll, dm: politDM, adjusted: politAdjusted,
      outcome: politOutcome.event_label,
      output_dm: politOutcome.output_dm,
      track_movement: politOutcome.track_movement,
      new_track: newPolitTrack,
    },
    output_rolls: {
      agriculture: { roll: agRoll, dm: agDM, adjusted: agAdj, multiplier: agMult },
      industry:    { roll: indRoll, dm: indDM, adjusted: indAdj, multiplier: indMult },
      materials:   { roll: matRoll, dm: matDM, adjusted: matAdj, multiplier: matMult },
    },
    active_event_dms: {},
    q_a,
    q_m,
    q_i,
    rations_available,
    raw_materials_available,
  };

  db.prepare('UPDATE colonies SET active_turn_json = ? WHERE id = ?')
    .run(JSON.stringify(resolution), id);

  return c.json(resolution, 200);
});

// ── POST /api/colonies/:id/turn/allocate-rations ──────────────────────────────

turns.post('/:id/turn/allocate-rations', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb();
  const colRow = db.prepare('SELECT active_turn_json FROM colonies WHERE id = ?')
    .get(id) as { active_turn_json: string | null } | undefined;
  if (!colRow) return c.json({ error: 'Colony not found' }, 404);
  if (!colRow.active_turn_json) return c.json({ error: 'No active turn — call turn/start first' }, 409);

  const resolution = JSON.parse(colRow.active_turn_json) as TurnResolution;

  const prevTurn = db.prepare(
    'SELECT total_laborers FROM colony_turns WHERE colony_id = ? ORDER BY month DESC LIMIT 1'
  ).get(id) as { total_laborers: number } | undefined;
  const totalLaborers = prevTurn?.total_laborers ?? 0;

  const body = await c.req.json() as RationAllocation;
  const { to_population, to_stockpile, to_export, to_animals } = body;
  const allocTotal = to_population + to_stockpile + to_export + to_animals;

  if (allocTotal > resolution.rations_available + 0.001) {
    return c.json({
      error: `Allocation (${allocTotal.toFixed(1)}) exceeds available rations (${resolution.rations_available.toFixed(1)})`,
    }, 400);
  }

  const sn = computeSN(to_population, totalLaborers);

  resolution.rations_allocation = body;
  resolution.sn = sn;
  db.prepare('UPDATE colonies SET active_turn_json = ? WHERE id = ?')
    .run(JSON.stringify(resolution), id);

  return c.json({
    q_a:               resolution.q_a,
    rations_available: resolution.rations_available,
    allocation:        body,
    sn,
  }, 200);
});

// ── POST /api/colonies/:id/turn/allocate-materials ────────────────────────────

turns.post('/:id/turn/allocate-materials', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb();
  const colRow = db.prepare('SELECT active_turn_json FROM colonies WHERE id = ?')
    .get(id) as { active_turn_json: string | null } | undefined;
  if (!colRow) return c.json({ error: 'Colony not found' }, 404);
  if (!colRow.active_turn_json) return c.json({ error: 'No active turn — call turn/start first' }, 409);

  const resolution = JSON.parse(colRow.active_turn_json) as TurnResolution;

  const body = await c.req.json() as MaterialsAllocation;
  const { to_agriculture, to_industry, to_energy, to_stockpile, to_export } = body;
  const allocTotal = to_agriculture + to_industry + to_energy + to_stockpile + to_export;

  if (allocTotal > resolution.raw_materials_available + 0.001) {
    return c.json({
      error: `Allocation (${allocTotal.toFixed(1)}) exceeds available raw materials (${resolution.raw_materials_available.toFixed(1)})`,
    }, 400);
  }

  resolution.materials_allocation = body;
  db.prepare('UPDATE colonies SET active_turn_json = ? WHERE id = ?')
    .run(JSON.stringify(resolution), id);

  return c.json({
    q_m:                       resolution.q_m,
    raw_materials_available:   resolution.raw_materials_available,
    allocation:                body,
  }, 200);
});

// ── POST /api/colonies/:id/turn/allocate-industrial ───────────────────────────

turns.post('/:id/turn/allocate-industrial', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb();
  const colRow = db.prepare('SELECT active_turn_json, home_tl FROM colonies WHERE id = ?')
    .get(id) as { active_turn_json: string | null; home_tl: number } | undefined;
  if (!colRow) return c.json({ error: 'Colony not found' }, 404);
  if (!colRow.active_turn_json) return c.json({ error: 'No active turn — call turn/start first' }, 409);

  const resolution = JSON.parse(colRow.active_turn_json) as TurnResolution;

  const prevTurn = db.prepare(`
    SELECT total_laborers, housing_m3, sl_value_per_person
    FROM colony_turns WHERE colony_id = ? ORDER BY month DESC LIMIT 1
  `).get(id) as { total_laborers: number; housing_m3: number; sl_value_per_person: number } | undefined;
  const totalLaborers      = prevTurn?.total_laborers ?? 0;
  const prevHousing        = prevTurn?.housing_m3 ?? 0;
  const prevSlValue        = prevTurn?.sl_value_per_person ?? 0;

  const body = await c.req.json() as IndustrialAllocation;
  const {
    to_capital_cr, to_housing_cr, to_consumer_goods_cr,
    to_armed_forces_cr, to_export_cr, to_road_network_cr,
  } = body;
  const allocTotal = to_capital_cr + to_housing_cr + to_consumer_goods_cr
                   + to_armed_forces_cr + to_export_cr + to_road_network_cr;

  if (allocTotal > resolution.q_i + 0.001) {
    return c.json({
      error: `Allocation (${allocTotal.toFixed(0)}) exceeds industrial output (${resolution.q_i.toFixed(0)})`,
    }, 400);
  }

  // Housing construction: 100 Cr → 1 m³
  const new_housing_m3 = prevHousing + to_housing_cr / 100;

  // SL: decay existing value then add consumer goods replenishment
  const sl_after_decay  = computeSLDecay(prevSlValue);
  const sl_added        = computeSLReplenishment(to_consumer_goods_cr, totalLaborers);
  const new_sl_value    = sl_after_decay + sl_added;

  const ss              = computeSS(new_housing_m3, totalLaborers);
  const sl_baseline     = getSlBaseline(colRow.home_tl);
  const sl_index        = computeSLIndex(new_sl_value, sl_baseline);

  resolution.industrial_allocation = body;
  resolution.ss       = ss;
  resolution.sl_value = new_sl_value;
  resolution.sl_index = sl_index;

  db.prepare('UPDATE colonies SET active_turn_json = ? WHERE id = ?')
    .run(JSON.stringify(resolution), id);

  return c.json({
    q_i:           resolution.q_i,
    allocation:    body,
    new_housing_m3,
    ss,
    sl_value:      new_sl_value,
    sl_index,
  }, 200);
});

export default turns;
