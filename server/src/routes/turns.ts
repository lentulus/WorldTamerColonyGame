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
import {
  computeMaintenanceCost,
  computeInfrastructureEfficiency,
} from '../engine/maintenance.js';
import {
  computeRoadNetworkStatus,
  computeTransportCapacity,
  computeTransportDemand,
} from '../engine/infrastructure.js';
import {
  applyActiveEvents,
  resolveWeatherDamage,
  resolveRandomEvent,
  resolveAcclimatization,
} from '../engine/events.js';
import { getSlBaseline } from '../db/colonies.js';
import type {
  TurnResolution, EventEffects,
  RationAllocation, MaterialsAllocation, IndustrialAllocation,
  FinalizeRequest, ColonyTurn,
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

  const tl           = Number(colRow.tech_level);
  const newMonth     = Number(colRow.current_month) + 1;
  const rations      = prevTurn?.rations ?? 0;
  const housingPrev  = prevTurn?.housing_m3 ?? 0;

  const snDMValues   = snDMs(prevTurn?.sn ?? 1.0);
  const ssPolitDM    = ssPoliticalDM(prevTurn?.ss ?? 100);
  const oldAcclStage = Number(colRow.acclimatization_stage);
  const acclResult   = resolveAcclimatization(id, oldAcclStage);
  const acclDM       = acclimatizationDM(acclResult.new_stage);
  const activeDMs    = applyActiveEvents(id, newMonth);
  const politTrack   = Number(colRow.political_track);
  const weatherFactor = Number(colRow.weather_factor);
  const agBonus      = Number(colRow.ag_output_roll_bonus);

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
  const stormDamage = resolveWeatherDamage(weatherOutcome, tl, id, newMonth);

  // ── Step 1: Random event trigger ──────────────────────────────────────────
  const reTriggerRoll = d20();
  let reEventRoll: number | null = null;
  let reDescription: string | null = null;
  let reEffects: EventEffects | null = null;
  let reImpact = { rations_lost: 0, housing_lost: 0 };

  if (reTriggerRoll >= 16) {
    reEventRoll = d20();
    db.prepare(`
      INSERT INTO colony_events (colony_id, month, event_type, description, effects, active_until_month)
      VALUES (?, ?, 'random', '', '{}', NULL)
    `).run(id, newMonth);
    const reResult = resolveRandomEvent(reEventRoll, id, newMonth, rations, housingPrev);
    reDescription = reResult.description;
    reEffects = reResult.effects;
    reImpact = reResult.impact;
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
  const agDM   = applyOutputDMs(-1, agPolitDM, snDMValues.output_dm, acclDM) + agBonus
               + (activeDMs.all_output_dm ?? 0) + (activeDMs.ag_output_dm ?? 0);
  const agAdj  = agRoll + agDM;
  const agMult = lookupOutputMultiplier(agAdj);

  const indRoll = d20();
  const indDM   = applyOutputDMs(-1, indPolitDM, snDMValues.output_dm, acclDM)
               + (activeDMs.all_output_dm ?? 0) + (activeDMs.ind_output_dm ?? 0);
  const indAdj  = indRoll + indDM;
  const indMult = lookupOutputMultiplier(indAdj);

  const matRoll = d20();
  const matDM   = applyOutputDMs(-1, matPolitDM, snDMValues.output_dm, acclDM)
               + (activeDMs.all_output_dm ?? 0) + (activeDMs.mat_output_dm ?? 0);
  const matAdj  = matRoll + matDM;
  const matMult = lookupOutputMultiplier(matAdj);

  // ── Production computation ────────────────────────────────────────────────
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

  const rations_available       = q_a + rations - reImpact.rations_lost;
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
    active_event_dms: activeDMs,
    acclimatization: {
      old_stage: oldAcclStage,
      new_stage: acclResult.new_stage,
      roll: acclResult.roll,
      advanced: acclResult.advanced,
      dm: acclDM,
    },
    storm_damage: stormDamage,
    random_event_rations_lost: reImpact.rations_lost,
    random_event_housing_lost: reImpact.housing_lost,
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

// ── POST /api/colonies/:id/turn/finalize ──────────────────────────────────────

turns.post('/:id/turn/finalize', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb();

  const colRow = db.prepare('SELECT * FROM colonies WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!colRow) return c.json({ error: 'Colony not found' }, 404);
  if (!colRow.active_turn_json) return c.json({ error: 'No active turn — call turn/start first' }, 409);

  const resolution = JSON.parse(String(colRow.active_turn_json)) as TurnResolution;

  const prevTurn = db.prepare(`
    SELECT total_laborers, al, il, ml, afl,
           ac, ic_light, ic_heavy, ic_construction, mc, power_kw,
           rations, raw_materials_t, housing_m3, sl_value_per_person, debt_cr,
           sn, ss, sl, infrastructure_efficiency
    FROM colony_turns WHERE colony_id = ? ORDER BY month DESC LIMIT 1
  `).get(id) as Record<string, number> | undefined;

  const body = await c.req.json() as FinalizeRequest;
  const { al, il, ml, afl } = body;
  const newTotal = al + il + ml + afl;
  const prevTotal = prevTurn?.total_laborers ?? 0;
  if (newTotal > prevTotal) {
    return c.json({ error: `Labor total (${newTotal}) exceeds workforce (${prevTotal})` }, 400);
  }

  const tl       = Number(colRow.tech_level);
  const newMonth = Number(colRow.current_month) + 1;
  const colonyAge = newMonth; // months since founding (founded_month = 0)

  // ── Reference data ────────────────────────────────────────────────────────
  const agRef  = db.prepare('SELECT ac_cost_cr, land_km2_per_al FROM ref_agriculture_tl WHERE tl = ?')
    .get(tl) as { ac_cost_cr: number; land_km2_per_al: number } | undefined
    ?? { ac_cost_cr: 0, land_km2_per_al: 0 };
  const indRef = db.prepare('SELECT light_ic_cost_cr, heavy_ic_cost_cr, construction_ic_cost_cr FROM ref_industry_tl WHERE tl = ?')
    .get(tl) as { light_ic_cost_cr: number; heavy_ic_cost_cr: number; construction_ic_cost_cr: number }
    | undefined ?? { light_ic_cost_cr: 0, heavy_ic_cost_cr: 0, construction_ic_cost_cr: 0 };
  const matRef = db.prepare('SELECT mc_cost_cr FROM ref_materials_tl WHERE tl = ?')
    .get(tl) as { mc_cost_cr: number } | undefined ?? { mc_cost_cr: 0 };
  const transRef = db.prepare('SELECT cost_mcr_per_km FROM ref_transport_tl WHERE tl = ?')
    .get(tl) as { cost_mcr_per_km: number } | undefined ?? { cost_mcr_per_km: 0 };

  // ── Capital purchases ─────────────────────────────────────────────────────
  const newAc    = body.new_ac ?? 0;
  const newIcL   = body.new_ic_light ?? 0;
  const newIcH   = body.new_ic_heavy ?? 0;
  const newIcC   = body.new_ic_construction ?? 0;
  const newMc    = body.new_mc ?? 0;

  const capitalCost = newAc * agRef.ac_cost_cr
    + newIcL * indRef.light_ic_cost_cr
    + newIcH * indRef.heavy_ic_cost_cr
    + newIcC * indRef.construction_ic_cost_cr
    + newMc  * matRef.mc_cost_cr;

  const capitalAvailable = resolution.industrial_allocation?.to_capital_cr ?? 0;
  if (capitalCost > capitalAvailable + 0.01) {
    return c.json({
      error: `Capital cost (${capitalCost.toFixed(0)} Cr) exceeds reserved credits (${capitalAvailable.toFixed(0)} Cr)`,
    }, 400);
  }

  // ── Updated capital counts ────────────────────────────────────────────────
  // Storm damage destroys agricultural capital (capital_sector: 'ac' in resolveWeatherDamage)
  const stormDamageAC  = resolution.storm_damage ?? 0;
  const ac             = Math.max(0, (prevTurn?.ac ?? 0) + newAc - stormDamageAC);
  const ic_light       = (prevTurn?.ic_light ?? 0) + newIcL;
  const ic_heavy       = (prevTurn?.ic_heavy ?? 0) + newIcH;
  const ic_construction = (prevTurn?.ic_construction ?? 0) + newIcC;
  const mc             = (prevTurn?.mc  ?? 0) + newMc;
  const power_kw       = prevTurn?.power_kw ?? 0;

  // ── New stockpiles ────────────────────────────────────────────────────────
  const ra = resolution.rations_allocation
    ?? { to_population: 0, to_stockpile: 0, to_export: 0, to_animals: 0 } as RationAllocation;
  const ma = resolution.materials_allocation
    ?? { to_agriculture: 0, to_industry: 0, to_energy: 0, to_stockpile: 0, to_export: 0 } as MaterialsAllocation;

  const new_rations  = Math.max(0, resolution.rations_available - ra.to_population - ra.to_export - (ra.to_animals ?? 0));
  const new_rm       = Math.max(0, resolution.raw_materials_available - ma.to_agriculture - ma.to_industry - (ma.to_energy ?? 0) - ma.to_export);

  // ── Housing and SL ───────────────────────────────────────────────────────
  const housingBuilt = resolution.industrial_allocation
    ? (resolution.industrial_allocation.to_housing_cr ?? 0) / 100
    : 0;
  const new_housing  = Math.max(
    0,
    (prevTurn?.housing_m3 ?? 0) + housingBuilt - (resolution.random_event_housing_lost ?? 0),
  );

  const prevSlValue  = prevTurn?.sl_value_per_person ?? 0;
  const slDecayed    = computeSLDecay(prevSlValue);
  const cgCredits    = resolution.industrial_allocation?.to_consumer_goods_cr ?? 0;
  const new_sl_value = slDecayed + computeSLReplenishment(cgCredits, newTotal || 1);
  const sl_baseline  = getSlBaseline(Number(colRow.home_tl));
  const sl_ratio     = sl_baseline > 0 ? new_sl_value / sl_baseline : 1.0;

  // ── Satisfaction indices ─────────────────────────────────────────────────
  const sn = resolution.sn ?? computeSN(0, newTotal || 1);
  const ss = computeSS(new_housing, newTotal || 1);

  // ── Maintenance ──────────────────────────────────────────────────────────
  const totalCapitalValue = ac * agRef.ac_cost_cr
    + ic_light * indRef.light_ic_cost_cr
    + ic_heavy * indRef.heavy_ic_cost_cr
    + ic_construction * indRef.construction_ic_cost_cr
    + mc * matRef.mc_cost_cr;
  const maintenance_cost_cr = computeMaintenanceCost(colonyAge, totalCapitalValue, 'all');

  const new_debt = (prevTurn?.debt_cr ?? 0) + maintenance_cost_cr - 0; // no revenue yet

  // ── Infrastructure efficiency ─────────────────────────────────────────────
  const inhabited_km2 = al * agRef.land_km2_per_al;
  const roadCredits   = resolution.industrial_allocation?.to_road_network_cr ?? 0;
  const newRoadSpent  = Number(colRow.road_network_cr_spent) + roadCredits;
  const roadStatus    = computeRoadNetworkStatus(inhabited_km2, newRoadSpent, tl);
  const infrastructure_efficiency = computeInfrastructureEfficiency(roadStatus.complete);

  const transportLines   = JSON.parse(String(colRow.transport_lines ?? '[]'));
  const transport_capacity = computeTransportCapacity(transportLines);
  const transport_demand   = computeTransportDemand(new_rm, newTotal);

  // ── Political state ───────────────────────────────────────────────────────
  const political_track = Number(colRow.political_track);

  // ── Write completed colony_turns row ─────────────────────────────────────
  const r = resolution;
  db.prepare(`
    INSERT INTO colony_turns (
      colony_id, month,
      total_laborers, al, il, ml, afl,
      ac, ic_light, ic_heavy, ic_construction, mc, power_kw,
      rations, raw_materials_t, housing_m3, sl_value_per_person, debt_cr,
      sn, ss, sl, political_track,
      weather_roll, weather_dm, weather_outcome,
      random_event_roll, political_roll, political_dm, political_outcome,
      ag_output_roll, ag_output_dm, ag_output_mult,
      ind_output_roll, ind_output_dm, ind_output_mult,
      mat_output_roll, mat_output_dm, mat_output_mult,
      q_a, q_i, q_m, infrastructure_efficiency, maintenance_cost_cr
    ) VALUES (
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `).run(
    id, newMonth,
    newTotal, al, il, ml, afl,
    ac, ic_light, ic_heavy, ic_construction, mc, power_kw,
    new_rations, new_rm, new_housing, new_sl_value, new_debt,
    sn, ss, sl_ratio, political_track,
    r.weather.roll, r.weather.dm, r.weather.outcome,
    r.random_event.event_roll ?? null,
    r.political.roll, r.political.dm, r.political.outcome,
    r.output_rolls.agriculture.roll, r.output_rolls.agriculture.dm, r.output_rolls.agriculture.multiplier,
    r.output_rolls.industry.roll, r.output_rolls.industry.dm, r.output_rolls.industry.multiplier,
    r.output_rolls.materials.roll, r.output_rolls.materials.dm, r.output_rolls.materials.multiplier,
    r.q_a, r.q_i, r.q_m, infrastructure_efficiency, maintenance_cost_cr,
  );

  // ── Advance colony record ─────────────────────────────────────────────────
  db.prepare(`
    UPDATE colonies
    SET current_month = ?, active_turn_json = NULL,
        road_network_cr_spent = road_network_cr_spent + ?
    WHERE id = ?
  `).run(newMonth, roadCredits, id);

  // Return the completed turn snapshot
  const newTurnRow = db.prepare(
    'SELECT * FROM colony_turns WHERE colony_id = ? AND month = ?'
  ).get(id, newMonth) as Record<string, unknown>;

  const turn: ColonyTurn = {
    colony_id: Number(newTurnRow.colony_id),
    month:     Number(newTurnRow.month),
    total_laborers: Number(newTurnRow.total_laborers),
    al: Number(newTurnRow.al), il: Number(newTurnRow.il),
    ml: Number(newTurnRow.ml), afl: Number(newTurnRow.afl),
    ac: Number(newTurnRow.ac), ic_light: Number(newTurnRow.ic_light),
    ic_heavy: Number(newTurnRow.ic_heavy), ic_construction: Number(newTurnRow.ic_construction),
    mc: Number(newTurnRow.mc), power_kw: Number(newTurnRow.power_kw),
    rations: Number(newTurnRow.rations), raw_materials_t: Number(newTurnRow.raw_materials_t),
    housing_m3: Number(newTurnRow.housing_m3),
    sl_value_per_person: Number(newTurnRow.sl_value_per_person),
    debt_cr: Number(newTurnRow.debt_cr),
    sn: Number(newTurnRow.sn), ss: Number(newTurnRow.ss), sl: Number(newTurnRow.sl),
    political_track: Number(newTurnRow.political_track),
    weather_roll: null, weather_dm: null, weather_outcome: null,
    random_event_roll: null, political_roll: null, political_dm: null, political_outcome: null,
    ag_output_roll: null, ag_output_dm: null, ag_output_mult: null,
    ind_output_roll: null, ind_output_dm: null, ind_output_mult: null,
    mat_output_roll: null, mat_output_dm: null, mat_output_mult: null,
    q_a: null, q_i: null, q_m: null,
    infrastructure_efficiency: Number(newTurnRow.infrastructure_efficiency),
    maintenance_cost_cr: Number(newTurnRow.maintenance_cost_cr),
  };

  return c.json({
    month: newMonth,
    turn,
    road_status: roadStatus,
    transport_capacity,
    transport_demand,
  }, 200);
});

export default turns;
