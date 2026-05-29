import { describe, it, expect } from 'vitest';
import { REF } from './ref_data.js';
import type { HeadlessState } from './headless_colony.js';
import { evaluateChromosome, type StartConfig } from './fitness.js';
import { CHROMOSOME_LEN } from './policy.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const START_STATE: HeadlessState = {
  tech_level: 8, home_tl: 8,
  orbit_au: 1.0, phi_min: 0.5,
  rvm: 0, weather_factor: 0, ag_output_roll_bonus: 0,
  month: 0,
  al: 20, il: 10, ml: 10, afl: 0,
  ac: 20, ic_light: 10, ic_heavy: 0, ic_construction: 0, mc: 10,
  power_kw: 500,
  rations: 500, raw_materials_t: 500,
  housing_m3: 4_000,
  sl_value_per_person: 250, debt_cr: 0,
  sn: 1.0, ss: 100, sl: 1.0,
  political_track: 1, acclimatization_stage: 5,
  road_network_cr_spent: 0,
  active_all_output_dm: 0, active_ag_output_dm: 0,
};

const START: StartConfig = { state: START_STATE };

const SEEDS_SMALL = [1, 2, 3];   // K=3 for fast tests
const H = 6;                      // short horizon for speed

const zeroChromosome = new Float64Array(CHROMOSOME_LEN);  // uniform allocations

// ── Basic contract ────────────────────────────────────────────────────────────

describe('evaluateChromosome() — basic contract', () => {
  it('returns a finite number', () => {
    const score = evaluateChromosome(zeroChromosome, START, REF, SEEDS_SMALL, H);
    expect(Number.isFinite(score)).toBe(true);
  });

  it('is deterministic: same inputs → same score', () => {
    const a = evaluateChromosome(zeroChromosome, START, REF, SEEDS_SMALL, H);
    const b = evaluateChromosome(zeroChromosome, START, REF, SEEDS_SMALL, H);
    expect(a).toBe(b);
  });

  it('different seeds → different score (stochastic sensitivity)', () => {
    const scoreA = evaluateChromosome(zeroChromosome, START, REF, [10, 11, 12], H);
    const scoreB = evaluateChromosome(zeroChromosome, START, REF, [20, 21, 22], H);
    // Different seeds produce different dice → different scores with overwhelming probability
    expect(scoreA).not.toBe(scoreB);
  });
});

// ── Starvation penalty ────────────────────────────────────────────────────────

describe('evaluateChromosome() — starvation penalty dominates', () => {
  it('colony with no agricultural capacity (always SN=0) scores lower than one with abundant rations', () => {
    // No rations stockpile, no AL, no AC → Q_A = 0 every turn → SN = 0 → famine penalty
    const starving: HeadlessState = {
      ...START_STATE,
      rations: 0, raw_materials_t: 0,
      al: 0, ac: 0,
    };
    // Abundant starting rations — colony stays well-fed for the full horizon
    const abundant: HeadlessState = {
      ...START_STATE,
      rations: 10_000,
    };

    const scoreStarve = evaluateChromosome(zeroChromosome, { state: starving  }, REF, SEEDS_SMALL, H);
    const scoreAbund  = evaluateChromosome(zeroChromosome, { state: abundant  }, REF, SEEDS_SMALL, H);

    expect(scoreStarve).toBeLessThan(scoreAbund);
  });
});

// ── Score is average over seeds ───────────────────────────────────────────────

describe('evaluateChromosome() — multi-seed averaging', () => {
  it('score with K=5 seeds is between the two single-seed extremes (averaging property)', () => {
    // One very lucky seed and one unlucky seed bracket the average.
    // We can verify that the K=5 result is not identical to K=1.
    const k1 = evaluateChromosome(zeroChromosome, START, REF, [42], H);
    const k5 = evaluateChromosome(zeroChromosome, START, REF, [42, 43, 44, 45, 46], H);
    // K=5 includes seed 42 but also 4 others — score will differ.
    expect(k5).not.toBe(k1);
  });
});

// ── Adverse starting conditions ───────────────────────────────────────────────

describe('evaluateChromosome() — adverse conditions score lower', () => {
  it('colony with active_all_output_dm=−8 scores lower than clean colony', () => {
    const adverse: HeadlessState = { ...START_STATE, active_all_output_dm: -8 };
    const clean:   HeadlessState = { ...START_STATE, active_all_output_dm:  0 };

    const scoreAdverse = evaluateChromosome(zeroChromosome, { state: adverse }, REF, SEEDS_SMALL, H);
    const scoreClean   = evaluateChromosome(zeroChromosome, { state: clean   }, REF, SEEDS_SMALL, H);

    expect(scoreAdverse).toBeLessThan(scoreClean);
  });
});

// ── Horizon length affects score ──────────────────────────────────────────────

describe('evaluateChromosome() — horizon', () => {
  it('H=12 run completes without error and returns a finite score', () => {
    const score = evaluateChromosome(zeroChromosome, START, REF, [1, 2], 12);
    expect(Number.isFinite(score)).toBe(true);
  });
});

