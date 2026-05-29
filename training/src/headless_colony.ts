// Pure simulation engine for GA training. No DB, no HTTP.
// Imports only the pure functions from server/src/engine/ — none that call getDb().

import {
  computeM, computePhiT,
  computeQA, computeQM, computeQI, computePowerFactor,
  computeSN, computeSS, computeSLDecay, computeSLReplenishment, computeSLIndex,
} from '../../server/src/engine/production.js';
import { applyOutputDMs } from '../../server/src/engine/rolls.js';
import {
  computeStormDamage,
  computeRandomEventEffect,
  computeAcclimatizationAdvance,
} from '../../server/src/engine/events.js';
import { computeMaintenanceCost, computeInfrastructureEfficiency } from '../../server/src/engine/maintenance.js';
import { computeRoadNetworkStatus } from '../../server/src/engine/infrastructure.js';
import {
  lookupOutputMultiplierH,
  lookupWeatherOutcomeH,
  lookupPoliticalOutcomeH,
  snDMsH, ssPoliticalDMH, getSlBaselineH,
} from './lookups.js';
import { d20, d6, type Rng } from './rng.js';
import type { RefData } from './ref_data.js';

// ── State and allocation types ────────────────────────────────────────────────

export interface HeadlessState {
  // World parameters (constant per colony)
  tech_level: number;
  home_tl: number;
  orbit_au: number;
  phi_min: number;
  rvm: number;
  weather_factor: number;
  ag_output_roll_bonus: number;
  // Monthly state
  month: number;
  al: number; il: number; ml: number; afl: number;
  ac: number; ic_light: number; ic_heavy: number; ic_construction: number; mc: number;
  power_kw: number;
  rations: number;
  raw_materials_t: number;
  housing_m3: number;
  sl_value_per_person: number;
  debt_cr: number;
  sn: number;
  ss: number;
  sl: number;
  political_track: number;
  acclimatization_stage: number;
  road_network_cr_spent: number;
  // Active event aggregate DMs (simplified: one value covering all ongoing events).
  // Duration events set this for one turn; it is cleared at turn start and overwritten
  // by the most recent event. Adequate for GA evaluation purposes.
  active_all_output_dm: number;
  active_ag_output_dm: number;
}

export interface Allocation {
  // Fractions of available quantity (0–1). Remainder implicitly stays in stockpile.
  rations_to_population_frac: number;
  rations_to_export_frac: number;
  // Materials fractions consumed (remainder stockpiled)
  mat_to_agriculture_frac: number;
  mat_to_industry_frac: number;
  mat_to_export_frac: number;
  // Industrial credit fractions (remainder exported)
  ind_to_capital_frac: number;
  ind_to_housing_frac: number;
  ind_to_consumer_goods_frac: number;
  ind_to_road_frac: number;
  // Labour fractions for next turn; afl = 1 - al - il - ml (floor 0)
  al_frac: number;
  il_frac: number;
  ml_frac: number;
}

// ── Acclimatization threshold table ──────────────────────────────────────────

const ACCL_THRESHOLD: Readonly<Record<number, number>> = { 1: 16, 2: 13, 3: 10, 4: 7 };

// ── stepTurn ──────────────────────────────────────────────────────────────────

export function stepTurn(
  state: HeadlessState,
  alloc: Allocation,
  ref:   RefData,
  rng:   Rng,
): HeadlessState {
  const tl          = state.tech_level;
  const newMonth    = state.month + 1;
  const totalLab    = state.al + state.il + state.ml + state.afl;

  // Reference rows for this TL
  const agRef  = ref.agriculture.find(r => r.tl === tl) ?? ref.agriculture[ref.agriculture.length - 1];
  const indRef  = ref.industry.find(r   => r.tl === tl) ?? ref.industry[ref.industry.length - 1];
  const matRef  = ref.materials.find(r  => r.tl === tl) ?? ref.materials[ref.materials.length - 1];

  // ── 1. Acclimatization ────────────────────────────────────────────────────
  const acclRoll     = d20(rng);
  const newAcclStage = computeAcclimatizationAdvance(state.acclimatization_stage, acclRoll);
  const acclDM       = Math.min(0, newAcclStage - 5);

  // ── 2. Active event DMs (from previous turns, already in state) ───────────
  const activeDM   = state.active_all_output_dm;
  const activeAgDM = state.active_ag_output_dm;

  // ── 3. Weather ────────────────────────────────────────────────────────────
  const weatherRoll     = d20(rng);
  const weatherAdjusted = weatherRoll + state.weather_factor;
  const weatherOutcome  = lookupWeatherOutcomeH(weatherAdjusted, ref);

  let currentAC = state.ac;
  if (weatherOutcome === 'severe_storm' || weatherOutcome === 'catastrophic_storm') {
    const stormType = weatherOutcome as 'severe_storm' | 'catastrophic_storm';
    const damageRoll = stormType === 'severe_storm' ? d6(rng) : d20(rng);
    const damage = computeStormDamage(damageRoll, tl, stormType);
    currentAC = Math.max(0, state.ac - damage);
  }

  // ── 4. Random event ───────────────────────────────────────────────────────
  const reTrigger = d20(rng);
  let nextRations  = state.rations;
  let nextHousing  = state.housing_m3;
  let nextActiveDM   = 0;
  let nextActiveAgDM = 0;
  let nextAgBonus    = state.ag_output_roll_bonus;

  if (reTrigger >= 16) {
    const reRoll = d20(rng);
    const ev = ref.randomEvents.find(r => r.roll === reRoll);
    if (ev) {
      const fx = JSON.parse(ev.effects) as {
        rations_lost_fraction?: number;
        housing_lost_fraction?: number;
        capital_units_destroyed?: number;
        all_output_dm?: number;
        ag_output_dm?: number;
        permanent_ag_roll_bonus?: number;
      };
      const impact = computeRandomEventEffect(
        { rations_lost_fraction: fx.rations_lost_fraction, housing_lost_fraction: fx.housing_lost_fraction },
        { rations: state.rations, housing_m3: state.housing_m3 },
      );
      nextRations = Math.max(0, state.rations - impact.rations_lost);
      nextHousing = Math.max(0, state.housing_m3 - impact.housing_lost);
      // Duration events apply their DM next turn (not this one — output rolls already use
      // the DMs from the previous turn's active_* fields captured in step 2 above).
      if (ev.duration_months > 0) {
        nextActiveDM   = fx.all_output_dm ?? 0;
        nextActiveAgDM = fx.ag_output_dm  ?? 0;
      }
      if (fx.permanent_ag_roll_bonus) {
        nextAgBonus += fx.permanent_ag_roll_bonus;
      }
    }
  }

  // ── 5. Political roll ─────────────────────────────────────────────────────
  const snDMs    = snDMsH(state.sn, ref);
  const ssPDM    = ssPoliticalDMH(state.ss, ref);
  const politDM  = state.political_track + snDMs.political_dm + ssPDM;
  const politRoll = d20(rng);
  const politAdj  = politRoll + politDM;
  const politOut  = lookupPoliticalOutcomeH(politAdj, ref);
  const newPolitTrack = Math.max(-3, Math.min(3, state.political_track + politOut.track_movement));

  // Distribute political output DM to sectors
  let agPDM = 0, indPDM = 0, matPDM = 0;
  switch (politOut.affected_sectors) {
    case 'all':        agPDM = indPDM = matPDM = politOut.output_dm; break;
    case 'mat_ind':    indPDM = matPDM = politOut.output_dm; break;
    case 'one_random': {
      const idx = Math.floor(rng.nextFloat() * 3);
      if      (idx === 0) agPDM  = politOut.output_dm;
      else if (idx === 1) indPDM = politOut.output_dm;
      else                matPDM = politOut.output_dm;
      break;
    }
  }

  // ── 6. Output rolls ───────────────────────────────────────────────────────
  const icTotal     = state.ic_light + state.ic_heavy + state.ic_construction;
  const powerFactor = computePowerFactor(state.power_kw, icTotal, state.mc, indRef.kw_per_unit, matRef.kw_per_unit);
  const inhabited   = state.al * agRef.land_km2_per_al;
  const roadStatus  = computeRoadNetworkStatus(inhabited, state.road_network_cr_spent, tl);
  const eta         = computeInfrastructureEfficiency(roadStatus.complete);
  const orbitMonths = Math.pow(state.orbit_au, 1.5) * 12;
  const phi         = computePhiT(newMonth, orbitMonths, state.phi_min);

  // Agriculture
  const agRoll  = d20(rng);
  const agDM    = applyOutputDMs(-1, agPDM, snDMs.output_dm, acclDM)
                + nextAgBonus + activeDM + activeAgDM;
  const agMult  = lookupOutputMultiplierH(agRoll + agDM, ref);
  const rmReq   = currentAC * agRef.rm_t_per_month;
  const R_A     = rmReq > 0 ? Math.min(1.0, state.raw_materials_t / rmReq) : 1.0;
  const M_A     = computeM(state.al, currentAC);
  const q_a     = computeQA(M_A, agRef.base_output_rations, R_A, phi, eta, powerFactor) * agMult;

  // Industry
  const indRoll = d20(rng);
  const indDM   = applyOutputDMs(-1, indPDM, snDMs.output_dm, acclDM) + activeDM;
  const indMult = lookupOutputMultiplierH(indRoll + indDM, ref);
  const M_I     = computeM(state.il, icTotal);
  const q_i     = computeQI(M_I, indRef.output_cr_per_il_month, eta, powerFactor) * indMult;

  // Materials
  const matRoll = d20(rng);
  const matDM   = applyOutputDMs(-1, matPDM, snDMs.output_dm, acclDM) + activeDM;
  const matMult = lookupOutputMultiplierH(matRoll + matDM, ref);
  const M_M     = computeM(state.ml, state.mc);
  const q_m     = computeQM(M_M, matRef.base_output_t_per_month, state.rvm, eta, powerFactor) * matMult;

  // ── 7. Apply allocations ──────────────────────────────────────────────────
  const rationsAvail = Math.max(0, q_a + nextRations);
  const matAvail     = Math.max(0, q_m + state.raw_materials_t);

  // Rations
  const toPop   = alloc.rations_to_population_frac * rationsAvail;
  const toExpR  = alloc.rations_to_export_frac * rationsAvail;
  const newRat  = Math.max(0, rationsAvail - toPop - toExpR);
  const sn      = computeSN(toPop, totalLab);

  // Raw materials
  const matConsumed = (alloc.mat_to_agriculture_frac + alloc.mat_to_industry_frac + alloc.mat_to_export_frac) * matAvail;
  const newRM = Math.max(0, matAvail - matConsumed);

  // Industrial credits
  const roadCr    = alloc.ind_to_road_frac            * q_i;
  const capCr     = alloc.ind_to_capital_frac         * q_i;
  const housingCr = alloc.ind_to_housing_frac         * q_i;
  const cgCr      = alloc.ind_to_consumer_goods_frac  * q_i;

  // Housing (100 Cr → 1 m³)
  const newHousing2 = Math.max(0, nextHousing + housingCr / 100);
  const ss = computeSS(newHousing2, totalLab || 1);

  // SL
  const slBaseline = getSlBaselineH(state.home_tl, ref);
  const slDecayed  = computeSLDecay(state.sl_value_per_person);
  const slAdded    = computeSLReplenishment(cgCr, totalLab || 1);
  const newSlValue = slDecayed + slAdded;
  const sl         = computeSLIndex(newSlValue, slBaseline);

  // Capital purchased with capital credits (simplified: all goes to AC)
  const acUnitCost  = agRef.ac_cost_cr > 0 ? agRef.ac_cost_cr : 1;
  const newACBought = Math.floor(capCr / acUnitCost);
  const finalAC     = currentAC + newACBought;

  // Road network
  const newRoadSpent = state.road_network_cr_spent + roadCr;

  // Maintenance
  const capValue = finalAC * agRef.ac_cost_cr
    + state.ic_light * indRef.light_ic_cost_cr + state.ic_heavy * indRef.heavy_ic_cost_cr
    + state.ic_construction * indRef.construction_ic_cost_cr + state.mc * matRef.mc_cost_cr;
  const maintenance = computeMaintenanceCost(newMonth, capValue, 'all');

  // ── 8. Labour reassignment ────────────────────────────────────────────────
  const newAl  = Math.round(alloc.al_frac * totalLab);
  const newIl  = Math.round(alloc.il_frac * totalLab);
  const newMl  = Math.round(alloc.ml_frac * totalLab);
  const newAfl = Math.max(0, totalLab - newAl - newIl - newMl);

  return {
    ...state,
    month:               newMonth,
    al: newAl, il: newIl, ml: newMl, afl: newAfl,
    ac:                  finalAC,
    rations:             newRat,
    raw_materials_t:     newRM,
    housing_m3:          newHousing2,
    sl_value_per_person: newSlValue,
    debt_cr:             state.debt_cr + maintenance,
    sn, ss, sl,
    political_track:     newPolitTrack,
    acclimatization_stage: newAcclStage,
    road_network_cr_spent: newRoadSpent,
    ag_output_roll_bonus:  nextAgBonus,
    active_all_output_dm:  nextActiveDM,
    active_ag_output_dm:   nextActiveAgDM,
  };
}
