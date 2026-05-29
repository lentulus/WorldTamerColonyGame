// Policy encoding: state vector → allocation fractions via a linear policy.
// Chromosome is a flat Float64Array of 288 floats (four linear maps W + b).

import { computePhiT } from '../../server/src/engine/production.js';
import { computeRoadNetworkStatus } from '../../server/src/engine/infrastructure.js';
import type { HeadlessState } from './headless_colony.js';
import type { RefData } from './ref_data.js';

// ── Dimensions ────────────────────────────────────────────────────────────────
// Output dims: rations=3 [pop,export,stockpile], materials=4 [ag,ind,export,stockpile],
//              industrial=5 [capital,housing,cg,road,export], labour=4 [al,il,ml,afl]

export const STATE_DIM     = 17;
const RATIONS_DIM          = 3;
const MATERIALS_DIM        = 4;
const INDUSTRIAL_DIM       = 5;
const LABOUR_DIM           = 4;

export const CHROMOSOME_LEN =
  (STATE_DIM * RATIONS_DIM   + RATIONS_DIM)   +
  (STATE_DIM * MATERIALS_DIM + MATERIALS_DIM) +
  (STATE_DIM * INDUSTRIAL_DIM + INDUSTRIAL_DIM) +
  (STATE_DIM * LABOUR_DIM    + LABOUR_DIM);   // = 288

// ── State vector ──────────────────────────────────────────────────────────────
// All components normalised to approx [−1, +1] or [0, 1].
// Index map:
//  0  sn                    clamp(sn, 0, 2)
//  1  ss_norm               ss / 200  (clamped to [0, 1])
//  2  sl                    clamp(sl, 0, 2)
//  3  political_track_norm  track / 3       → [−1, +1]
//  4  accl_stage_norm       stage / 5       → [0, 1]
//  5  rations_months_norm   months of stock / 12  → [0, 1]
//  6  rm_months_norm        months of RM   / 12  → [0, 1]
//  7  debt_norm             debt / annual_ind_cap → [0, 1]
//  8  road_pct              spent / required      → [0, 1]
//  9  al_frac               al / totalLab
// 10  il_frac               il / totalLab
// 11  ml_frac               ml / totalLab
// 12  ac_frac               ac / totalCap
// 13  ic_frac               (ic_l+ic_h+ic_c) / totalCap
// 14  mc_frac               mc / totalCap
// 15  phi_t                 seasonal factor  → [phi_min, 1]
// 16  weather_factor_norm   weather_factor / 5  (clamped to [−1, +1])

export function buildStateVector(state: HeadlessState, ref: RefData): Float64Array {
  const tl       = state.tech_level;
  const agRef    = ref.agriculture.find(r => r.tl === tl) ?? ref.agriculture[ref.agriculture.length - 1];
  const indRef   = ref.industry.find(r => r.tl === tl) ?? ref.industry[ref.industry.length - 1];

  const totalLab = state.al + state.il + state.ml + state.afl;
  const icTotal  = state.ic_light + state.ic_heavy + state.ic_construction;
  const totalCap = state.ac + icTotal + state.mc;

  // Rations months of buffer
  const rationsMonths = totalLab > 0
    ? Math.min(12, state.rations / totalLab) / 12
    : 0;

  // Raw-materials months of buffer (AC raw-materials requirement)
  const rmPerMonth    = state.ac * agRef.rm_t_per_month;
  const rmMonths      = rmPerMonth > 0
    ? Math.min(12, state.raw_materials_t / rmPerMonth) / 12
    : 1.0;  // no RM needed → no constraint

  // Debt as fraction of annual industrial output capacity
  const annualInd = icTotal * indRef.output_cr_per_il_month * 12;
  const debtNorm  = annualInd > 0
    ? Math.min(1, state.debt_cr / annualInd)
    : 0;

  // Road network completion (0–1)
  const inhabited  = state.al * agRef.land_km2_per_al;
  const roadStatus = computeRoadNetworkStatus(inhabited, state.road_network_cr_spent, tl);
  const roadPct    = roadStatus.required_cr > 0
    ? Math.min(1, roadStatus.spent_cr / roadStatus.required_cr)
    : 1.0;

  // Labour fractions
  const alF = totalLab > 0 ? state.al / totalLab : 0;
  const ilF = totalLab > 0 ? state.il / totalLab : 0;
  const mlF = totalLab > 0 ? state.ml / totalLab : 0;

  // Capital mix fractions
  const acF  = totalCap > 0 ? state.ac   / totalCap : 0;
  const icF  = totalCap > 0 ? icTotal    / totalCap : 0;
  const mcF  = totalCap > 0 ? state.mc   / totalCap : 0;

  // Seasonal factor
  const orbitMonths = Math.pow(state.orbit_au, 1.5) * 12;
  const phi = computePhiT(state.month, orbitMonths, state.phi_min);

  const v = new Float64Array(STATE_DIM);
  v[ 0] = Math.min(2, Math.max(0, state.sn));
  v[ 1] = Math.min(1, Math.max(0, state.ss / 200));
  v[ 2] = Math.min(2, Math.max(0, state.sl));
  v[ 3] = state.political_track / 3;
  v[ 4] = state.acclimatization_stage / 5;
  v[ 5] = rationsMonths;
  v[ 6] = rmMonths;
  v[ 7] = debtNorm;
  v[ 8] = roadPct;
  v[ 9] = alF;
  v[10] = ilF;
  v[11] = mlF;
  v[12] = acF;
  v[13] = icF;
  v[14] = mcF;
  v[15] = phi;
  v[16] = Math.min(1, Math.max(-1, state.weather_factor / 5));
  return v;
}

// ── Softmax ───────────────────────────────────────────────────────────────────

export function softmax(logits: number[]): number[] {
  const max  = Math.max(...logits);
  const exps = logits.map(x => Math.exp(x - max));
  const sum  = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

// ── Linear layer (W stored row-major [stateDim × outDim]) ─────────────────────

function linear(
  W:        Float64Array,
  b:        Float64Array,
  state:    Float64Array,
  stateDim: number,
  outDim:   number,
): number[] {
  const logits = new Array<number>(outDim).fill(0);
  for (let j = 0; j < outDim; j++) {
    for (let i = 0; i < stateDim; i++) {
      logits[j] += W[i * outDim + j] * state[i];
    }
    logits[j] += b[j];
  }
  return logits;
}

// ── policyAllocate ────────────────────────────────────────────────────────────
// Returns fraction arrays (each summing to 1.0) for each allocation category.
// rations[0] = pop, [1] = export, [2] = stockpile
// materials[0] = ag, [1] = ind, [2] = export, [3] = stockpile
// industrial[0] = capital, [1] = housing, [2] = cg, [3] = road, [4] = export
// labour[0] = al, [1] = il, [2] = ml, [3] = afl

export function policyAllocate(
  chromosome: Float64Array,
  stateVec:   Float64Array,
): { rations: number[]; materials: number[]; industrial: number[]; labour: number[] } {
  let off = 0;

  const rW = chromosome.subarray(off, off + STATE_DIM * RATIONS_DIM);
  off += STATE_DIM * RATIONS_DIM;
  const rB = chromosome.subarray(off, off + RATIONS_DIM);
  off += RATIONS_DIM;

  const mW = chromosome.subarray(off, off + STATE_DIM * MATERIALS_DIM);
  off += STATE_DIM * MATERIALS_DIM;
  const mB = chromosome.subarray(off, off + MATERIALS_DIM);
  off += MATERIALS_DIM;

  const iW = chromosome.subarray(off, off + STATE_DIM * INDUSTRIAL_DIM);
  off += STATE_DIM * INDUSTRIAL_DIM;
  const iB = chromosome.subarray(off, off + INDUSTRIAL_DIM);
  off += INDUSTRIAL_DIM;

  const lW = chromosome.subarray(off, off + STATE_DIM * LABOUR_DIM);
  off += STATE_DIM * LABOUR_DIM;
  const lB = chromosome.subarray(off, off + LABOUR_DIM);

  return {
    rations:    softmax(linear(rW, rB, stateVec, STATE_DIM, RATIONS_DIM)),
    materials:  softmax(linear(mW, mB, stateVec, STATE_DIM, MATERIALS_DIM)),
    industrial: softmax(linear(iW, iB, stateVec, STATE_DIM, INDUSTRIAL_DIM)),
    labour:     softmax(linear(lW, lB, stateVec, STATE_DIM, LABOUR_DIM)),
  };
}

// ── applySubsistenceFloor ─────────────────────────────────────────────────────
// Ensures fracs[0] (pop fraction) provides at least subsistenceLaborers rations.
// Rescales the remaining fracs proportionally to keep the sum at 1.0.

export function applySubsistenceFloor(
  rationsFracs:       number[],
  subsistenceLaborers: number,
  rationsAvailable:   number,
): number[] {
  if (rationsAvailable <= 0 || subsistenceLaborers <= 0) return [...rationsFracs];

  const minPopFrac = Math.min(1.0, subsistenceLaborers / rationsAvailable);
  if (rationsFracs[0] >= minPopFrac) return [...rationsFracs];

  // Raise pop to minimum; rescale remaining fracs to fill the rest
  const surplus  = 1.0 - minPopFrac;
  const otherSum = rationsFracs.slice(1).reduce((a, b) => a + b, 0);
  const result   = [minPopFrac];
  for (let i = 1; i < rationsFracs.length; i++) {
    result.push(
      otherSum > 0
        ? (rationsFracs[i] / otherSum) * surplus
        : surplus / (rationsFracs.length - 1),
    );
  }
  return result;
}
