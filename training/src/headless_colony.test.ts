import { describe, it, expect } from 'vitest';
import { REF } from './ref_data.js';
import { createRng } from './rng.js';
import { stepTurn, type HeadlessState, type Allocation } from './headless_colony.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

// A stable TL-8 colony: acclimatization complete (no DM), no active events,
// weather_factor = 0 (neutralises weather DM), large buffers.
// acclimatization_stage = 5 → DM = 0 every turn, no stochastic stage advance.
const BASE: HeadlessState = {
  tech_level: 8, home_tl: 8,
  orbit_au: 1.0, phi_min: 0.5,
  rvm: 0, weather_factor: 0, ag_output_roll_bonus: 0,
  month: 5,
  al: 20, il: 10, ml: 10, afl: 0,
  ac: 30, ic_light: 10, ic_heavy: 0, ic_construction: 0, mc: 10,
  power_kw: 500,
  rations: 5_000,        // large buffer so SN tests are robust
  raw_materials_t: 2_000,
  housing_m3: 4_000,
  sl_value_per_person: 250, debt_cr: 0,
  sn: 1.0, ss: 100.0, sl: 1.0,
  political_track: 1, acclimatization_stage: 5,
  road_network_cr_spent: 0,
  active_all_output_dm: 0, active_ag_output_dm: 0,
};

// All-to-stockpile allocation: fracs = 0 means everything implicit stays in stockpile.
// al+il+ml fracs sum to 1.0 → afl = 0.
const HOLD: Allocation = {
  rations_to_population_frac: 0, rations_to_export_frac: 0,
  mat_to_agriculture_frac: 0, mat_to_industry_frac: 0, mat_to_export_frac: 0,
  ind_to_capital_frac: 0, ind_to_housing_frac: 0, ind_to_consumer_goods_frac: 0,
  ind_to_road_frac: 0,
  al_frac: 0.5, il_frac: 0.25, ml_frac: 0.25,  // afl gets the remainder (0)
};

// All-to-population ration allocation.
const FEED: Allocation = { ...HOLD, rations_to_population_frac: 1.0 };

// ── Determinism ───────────────────────────────────────────────────────────────

describe('stepTurn() — determinism', () => {
  it('same seed → identical new state for every field', () => {
    const a = stepTurn(BASE, HOLD, REF, createRng(42));
    const b = stepTurn(BASE, HOLD, REF, createRng(42));
    expect(a).toEqual(b);
  });

  it('different seed → at least one field differs (dice matter)', () => {
    const a = stepTurn(BASE, HOLD, REF, createRng(1));
    const b = stepTurn(BASE, HOLD, REF, createRng(2));
    // political_track or rations will vary with dice
    const same = JSON.stringify(a) === JSON.stringify(b);
    expect(same).toBe(false);
  });
});

// ── Month counter ─────────────────────────────────────────────────────────────

describe('stepTurn() — month counter', () => {
  it('increments month by 1', () => {
    const next = stepTurn(BASE, HOLD, REF, createRng(1));
    expect(next.month).toBe(BASE.month + 1);
  });
});

// ── SN formula ───────────────────────────────────────────────────────────────

describe('stepTurn() — SN formula', () => {
  it('SN = rations_to_population / total_laborers', () => {
    // With a 5000-ration buffer and 40 total laborers, rations_available >> 40.
    // To population = 1.0 × rations_available.  SN = rations_available / 40.
    const next = stepTurn(BASE, FEED, REF, createRng(7));
    const totalLaborers = BASE.al + BASE.il + BASE.ml + BASE.afl;
    // rations_available = Q_A + BASE.rations; sn = rations_available / totalLaborers.
    // We can verify the formula by re-deriving: sn × totalLaborers = rations_to_population.
    // The new rations stockpile = rations_available - rations_to_population (≈ 0 since frac=1).
    // So: next.rations ≈ 0 and next.sn > 0.
    expect(next.sn).toBeGreaterThan(0);
    // With a 5000-ration buffer ÷ 40 laborers ≥ 125 — well above 1.0.
    expect(next.sn).toBeGreaterThanOrEqual(1.0);
  });

  it('SN ≥ 1.0 when large stockpile is fully fed to population', () => {
    // 5000 rations ÷ 40 laborers = 125. Even if Q_A = 0, SN = 5000/40 = 125. ✓
    const next = stepTurn(BASE, FEED, REF, createRng(99));
    expect(next.sn).toBeGreaterThanOrEqual(1.0);
  });

  it('SN ≈ 0 when zero rations allocated to population and stockpile is zero', () => {
    const broke: HeadlessState = { ...BASE, rations: 0 };
    // rations_available = Q_A + 0. With HOLD (frac=0), all rations go to stockpile.
    // sn = 0 / totalLaborers = 0.
    const next = stepTurn(broke, HOLD, REF, createRng(3));
    // SN should be 0 since nothing was allocated to population.
    expect(next.sn).toBe(0);
  });
});

// ── Political track clamping ──────────────────────────────────────────────────

describe('stepTurn() — political track', () => {
  it('stays within [−3, +3] regardless of DMs', () => {
    // Run 50 turns from an extreme starting track and verify clamping.
    let state: HeadlessState = { ...BASE, political_track: 3 };
    for (let i = 0; i < 50; i++) {
      state = stepTurn(state, HOLD, REF, createRng(i));
      expect(state.political_track).toBeGreaterThanOrEqual(-3);
      expect(state.political_track).toBeLessThanOrEqual(3);
    }
  });
});

// ── Storm damage ──────────────────────────────────────────────────────────────

describe('stepTurn() — storm damage', () => {
  it('catastrophic weather (factor=99, TL=0) always reduces AC', () => {
    // weather_factor = 99 → adjusted roll ≥ 100 → catastrophic_storm every turn.
    // TL 0: storm damage = max(0, d6 - 0) × 10 ≥ 10 per turn → AC will decrease.
    const fragile: HeadlessState = {
      ...BASE,
      weather_factor: 99, tech_level: 0,
      ac: 100, // large enough to survive but measurably reduced
    };
    const next = stepTurn(fragile, HOLD, REF, createRng(1));
    expect(next.ac).toBeLessThan(fragile.ac);
    expect(next.ac).toBeGreaterThanOrEqual(0);  // never negative
  });

  it('no storm (weather_factor=−99) leaves AC unchanged', () => {
    // weather_factor = -99 → adjusted roll ≤ -80 → always 'none'.
    const calm: HeadlessState = { ...BASE, weather_factor: -99 };
    const next = stepTurn(calm, HOLD, REF, createRng(1));
    expect(next.ac).toBe(calm.ac);  // no storm → AC untouched
  });
});

// ── Active output DMs ─────────────────────────────────────────────────────────

describe('stepTurn() — active event DMs affect output', () => {
  it('all_output_dm=+99 produces more rations than all_output_dm=−99 (same seed)', () => {
    // With extreme DMs, the output multiplier is capped at 1.20 (max) vs 0.80 (min).
    // Use HOLD (frac=0 to population) so stockpile = prev + Q_A.
    // new_rations = rations + Q_A  →  higher with +99 DM.
    const boost: HeadlessState = { ...BASE, rations: 0, active_all_output_dm:  99 };
    const nerf:  HeadlessState = { ...BASE, rations: 0, active_all_output_dm: -99 };
    const nextBoost = stepTurn(boost, HOLD, REF, createRng(55));
    const nextNerf  = stepTurn(nerf,  HOLD, REF, createRng(55));
    expect(nextBoost.rations).toBeGreaterThan(nextNerf.rations);
  });
});

// ── Labour reassignment ───────────────────────────────────────────────────────

describe('stepTurn() — labour assignment', () => {
  it('new AL/IL/ML/AFL sum ≤ total_laborers', () => {
    const next = stepTurn(BASE, HOLD, REF, createRng(8));
    const total = BASE.al + BASE.il + BASE.ml + BASE.afl;
    expect(next.al + next.il + next.ml + next.afl).toBeLessThanOrEqual(total);
  });

  it('labour fracs respected: al_frac=0.5 of 40 laborers → al=20', () => {
    // HOLD has al_frac=0.5, total=40 → al=20
    const next = stepTurn(BASE, HOLD, REF, createRng(1));
    expect(next.al).toBe(20);
    expect(next.il).toBe(10);
    expect(next.ml).toBe(10);
    expect(next.afl).toBe(0);
  });
});
