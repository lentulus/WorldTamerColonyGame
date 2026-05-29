// Fitness evaluation: run a colony for H turns under a chromosome and score it.
// Multi-seed averaging smooths out dice variance.

import { stepTurn, type HeadlessState, type Allocation } from './headless_colony.js';
import { buildStateVector, policyAllocate, applySubsistenceFloor } from './policy.js';
import { createRng } from './rng.js';
import type { RefData } from './ref_data.js';

export interface StartConfig {
  state: HeadlessState;
}

// ── fracsToAllocation ─────────────────────────────────────────────────────────
// Maps the four softmax fraction arrays from policyAllocate() to the Allocation
// interface expected by stepTurn(). The subsistence floor is applied to rations.

function fracsToAllocation(
  fracs: ReturnType<typeof policyAllocate>,
  state: HeadlessState,
  ref:   RefData,
): Allocation {
  // rations[0]=pop, [1]=export, [2]=stockpile
  // Apply subsistence floor: ensure population gets at least 1 ration/laborer
  const totalLab       = state.al + state.il + state.ml + state.afl;
  const agRef          = ref.agriculture.find(r => r.tl === state.tech_level) ?? ref.agriculture[ref.agriculture.length - 1];
  const rmReq          = state.ac * agRef.rm_t_per_month;
  const R_A            = rmReq > 0 ? Math.min(1, state.raw_materials_t / rmReq) : 1.0;
  // Rough Q_A estimate for available rations (we use state.rations as lower bound)
  const rationsAvail   = Math.max(state.rations, 1);
  const rationsFracs   = applySubsistenceFloor(fracs.rations, totalLab, rationsAvail);

  // materials[0]=ag, [1]=ind, [2]=export, [3]=stockpile → consumed = [0]+[1]+[2]
  // industrial[0]=capital, [1]=housing, [2]=cg, [3]=road, [4]=export
  // labour[0]=al, [1]=il, [2]=ml, [3]=afl (sum to 1 → afl gets remainder in stepTurn)

  // Clamp each fraction to [0, 1] for safety (softmax guarantees this, but for clarity)
  return {
    rations_to_population_frac:  Math.min(1, rationsFracs[0]),
    rations_to_export_frac:      Math.min(1, rationsFracs[1]),
    mat_to_agriculture_frac:     fracs.materials[0],
    mat_to_industry_frac:        fracs.materials[1],
    mat_to_export_frac:          fracs.materials[2],
    ind_to_capital_frac:         fracs.industrial[0],
    ind_to_housing_frac:         fracs.industrial[1],
    ind_to_consumer_goods_frac:  fracs.industrial[2],
    ind_to_road_frac:            fracs.industrial[3],
    al_frac:                     fracs.labour[0],
    il_frac:                     fracs.labour[1],
    ml_frac:                     fracs.labour[2],
  };
}

// ── scoreTrajectory ───────────────────────────────────────────────────────────
// Score a sequence of states produced by one evaluation run.
//
//   score = 3.0 × mean_sn_clamped
//         + 1.5 × mean_ss_norm
//         + 1.5 × mean_sl_clamped
//         + 2.0 × (final_laborers / initial_laborers)
//         + 1.0 × (final_political_track + 3) / 6
//         + 1.0 × road_pct_at_H
//         − 2.0 × turns_with_sn_below_0.85
//         − 10.0 × turns_with_sn_below_0.65

function scoreTrajectory(states: HeadlessState[], initial: HeadlessState): number {
  const H = states.length;
  if (H === 0) return 0;

  const initialLab = initial.al + initial.il + initial.ml + initial.afl;
  const final      = states[H - 1];
  const finalLab   = final.al + final.il + final.ml + final.afl;

  let sumSN = 0, sumSS = 0, sumSL = 0;
  let crisisTurns = 0, famineturns = 0;
  for (const s of states) {
    sumSN += Math.min(2, Math.max(0, s.sn));
    sumSS += Math.min(1, Math.max(0, s.ss / 200));
    sumSL += Math.min(2, Math.max(0, s.sl));
    if (s.sn < 0.85) crisisTurns++;
    if (s.sn < 0.65) famineturns++;
  }

  const meanSN = sumSN / H;
  const meanSS = sumSS / H;
  const meanSL = sumSL / H;

  // Growth: ratio of final to initial laborers, capped at 2 to avoid runaway weighting
  const growthRatio  = initialLab > 0 ? Math.min(2, finalLab / initialLab) : 1;

  // Political track normalised to [0, 1]
  const politNorm    = (final.political_track + 3) / 6;

  // Road completion (road_pct already 0–1 via spent/required)
  // Re-derive from state fields using the same logic as buildStateVector
  // (we don't import computeRoadNetworkStatus here to keep fitness.ts lean;
  //  instead we use road_network_cr_spent as a proxy clamped to [0, 1])
  const roadPct      = Math.min(1, final.road_network_cr_spent / Math.max(1, final.road_network_cr_spent + 5_000_000));

  return (
      3.0 * meanSN
    + 1.5 * meanSS
    + 1.5 * meanSL
    + 2.0 * growthRatio
    + 1.0 * politNorm
    + 1.0 * roadPct
    - 2.0 * crisisTurns
    - 10.0 * famineturns
  );
}

// ── evaluateChromosome ────────────────────────────────────────────────────────

export function evaluateChromosome(
  chromosome: Float64Array,
  start:      StartConfig,
  ref:        RefData,
  seeds:      number[],
  H:          number,
): number {
  if (seeds.length === 0) return 0;

  let totalScore = 0;

  for (const seed of seeds) {
    const rng    = createRng(seed);
    let   state  = { ...start.state };
    const trajectory: HeadlessState[] = [];

    for (let t = 0; t < H; t++) {
      const sv     = buildStateVector(state, ref);
      const fracs  = policyAllocate(chromosome, sv);
      const alloc  = fracsToAllocation(fracs, state, ref);
      state        = stepTurn(state, alloc, ref, rng);
      trajectory.push(state);
    }

    totalScore += scoreTrajectory(trajectory, start.state);
  }

  return totalScore / seeds.length;
}
