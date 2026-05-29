import { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getColony } from '../db/colonies.js';
import {
  CHROMOSOME_LEN,
  buildStateVector,
  policyAllocate,
  applySubsistenceFloor,
} from '../../../training/src/policy.js';
import { REF } from '../../../training/src/ref_data.js';
import type { HeadlessState } from '../../../training/src/headless_colony.js';
import type { Colony, ColonyTurn } from '@worldtamer/shared';

// ── Policy path (configurable for tests) ─────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
let _policyPath = join(__dirname, '..', '..', '..', 'training', 'best_policy.json');

export function setPolicyPath(p: string): void {
  _policyPath = p;
  _cachedPolicy = null;   // invalidate cache when path changes
}

// ── Policy cache ──────────────────────────────────────────────────────────────

interface PolicyFile {
  chromosome: number[];
  score: number;
  generation: number;
}

let _cachedPolicy: Float64Array | null = null;

function loadPolicy(): Float64Array | null {
  if (_cachedPolicy) return _cachedPolicy;
  if (!existsSync(_policyPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(_policyPath, 'utf8')) as PolicyFile;
    if (!Array.isArray(raw.chromosome) || raw.chromosome.length !== CHROMOSOME_LEN) return null;
    _cachedPolicy = new Float64Array(raw.chromosome);
    return _cachedPolicy;
  } catch {
    return null;
  }
}

// ── colonyToHeadlessState ─────────────────────────────────────────────────────

function colonyToHeadlessState(colony: Colony, turn: ColonyTurn): HeadlessState {
  return {
    tech_level:            colony.tech_level,
    home_tl:               colony.home_tl,
    orbit_au:              colony.orbit_au,
    phi_min:               colony.phi_min,
    rvm:                   colony.rvm,
    weather_factor:        colony.weather_factor,
    ag_output_roll_bonus:  colony.ag_output_roll_bonus,
    month:                 colony.current_month,
    al:  turn.al,  il:  turn.il,  ml:  turn.ml,  afl: turn.afl,
    ac:  turn.ac,
    ic_light:        turn.ic_light,
    ic_heavy:        turn.ic_heavy,
    ic_construction: turn.ic_construction,
    mc:              turn.mc,
    power_kw:        turn.power_kw,
    rations:         turn.rations,
    raw_materials_t: turn.raw_materials_t,
    housing_m3:      turn.housing_m3,
    sl_value_per_person: turn.sl_value_per_person,
    debt_cr:         turn.debt_cr,
    sn:              turn.sn,
    ss:              turn.ss,
    sl:              turn.sl,
    political_track: turn.political_track,
    acclimatization_stage: colony.acclimatization_stage,
    road_network_cr_spent: colony.road_network_cr_spent,
    active_all_output_dm: 0,
    active_ag_output_dm:  0,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

const suggest = new Hono();

suggest.get('/:id/suggest', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400);

  const policy = loadPolicy();
  if (!policy) {
    return c.json({ error: 'No trained policy available — run pnpm train first' }, 503);
  }

  const data = getColony(id);
  if (!data) return c.json({ error: 'Colony not found' }, 404);

  const state    = colonyToHeadlessState(data.colony, data.turn);
  const stateVec = buildStateVector(state, REF);
  const fracs    = policyAllocate(policy, stateVec);

  // Apply subsistence floor to rations
  const totalLaborers  = data.turn.total_laborers;
  const rationsAvail   = Math.max(data.turn.rations, 1);
  const rationsFracs   = applySubsistenceFloor(fracs.rations, totalLaborers, rationsAvail);

  return c.json({
    rations: {
      to_population_frac: rationsFracs[0],
      to_export_frac:     rationsFracs[1],
      // [2] is implicit stockpile — not returned; UI shows it as remainder
    },
    materials: {
      to_agriculture_frac: fracs.materials[0],
      to_industry_frac:    fracs.materials[1],
      to_export_frac:      fracs.materials[2],
      // [3] is stockpile remainder
    },
    industrial: {
      to_capital_frac:        fracs.industrial[0],
      to_housing_frac:        fracs.industrial[1],
      to_consumer_goods_frac: fracs.industrial[2],
      to_road_frac:           fracs.industrial[3],
      // [4] is export remainder
    },
    labour: {
      al_frac: fracs.labour[0],
      il_frac: fracs.labour[1],
      ml_frac: fracs.labour[2],
      // [3] is afl remainder
    },
  }, 200);
});

export default suggest;
