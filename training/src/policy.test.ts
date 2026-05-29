import { describe, it, expect } from 'vitest';
import { REF } from './ref_data.js';
import type { HeadlessState } from './headless_colony.js';
import {
  STATE_DIM,
  CHROMOSOME_LEN,
  buildStateVector,
  policyAllocate,
  applySubsistenceFloor,
  softmax,
} from './policy.js';

// ── Shared fixture ────────────────────────────────────────────────────────────

const STATE: HeadlessState = {
  tech_level: 8, home_tl: 8,
  orbit_au: 1.0, phi_min: 0.5,
  rvm: 0, weather_factor: 0, ag_output_roll_bonus: 0,
  month: 6,
  al: 20, il: 10, ml: 10, afl: 0,
  ac: 20, ic_light: 10, ic_heavy: 0, ic_construction: 0, mc: 10,
  power_kw: 500,
  rations: 200, raw_materials_t: 400,
  housing_m3: 3_000,
  sl_value_per_person: 250, debt_cr: 5_000,
  sn: 1.0, ss: 100, sl: 1.0,
  political_track: 1, acclimatization_stage: 5,
  road_network_cr_spent: 0,
  active_all_output_dm: 0, active_ag_output_dm: 0,
};

// ── Constants ─────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('STATE_DIM = 17', () => {
    expect(STATE_DIM).toBe(17);
  });

  it('CHROMOSOME_LEN = STATE_DIM×3+3 + STATE_DIM×4+4 + STATE_DIM×5+5 + STATE_DIM×4+4 = 288', () => {
    // rations(3) + materials(4) + industrial(5) + labour(4) output dims
    const expected = (STATE_DIM * 3 + 3) + (STATE_DIM * 4 + 4) + (STATE_DIM * 5 + 5) + (STATE_DIM * 4 + 4);
    expect(CHROMOSOME_LEN).toBe(expected);
    expect(CHROMOSOME_LEN).toBe(288);
  });
});

// ── buildStateVector ──────────────────────────────────────────────────────────

describe('buildStateVector()', () => {
  it('returns Float64Array of length STATE_DIM', () => {
    const v = buildStateVector(STATE, REF);
    expect(v).toBeInstanceOf(Float64Array);
    expect(v.length).toBe(STATE_DIM);
  });

  it('all elements are finite (no NaN, no Infinity)', () => {
    const v = buildStateVector(STATE, REF);
    for (let i = 0; i < v.length; i++) {
      expect(Number.isFinite(v[i])).toBe(true);
    }
  });

  it('remains finite when most state fields are zero', () => {
    const zero: HeadlessState = {
      ...STATE,
      al: 0, il: 0, ml: 0, afl: 0,
      ac: 0, ic_light: 0, ic_heavy: 0, ic_construction: 0, mc: 0,
      rations: 0, raw_materials_t: 0, housing_m3: 0,
      debt_cr: 0, sl_value_per_person: 0,
    };
    const v = buildStateVector(zero, REF);
    for (let i = 0; i < v.length; i++) {
      expect(Number.isFinite(v[i])).toBe(true);
    }
  });

  it('sn component (index 0) is clamped to [0, 2]', () => {
    const high: HeadlessState = { ...STATE, sn: 99 };
    const v = buildStateVector(high, REF);
    expect(v[0]).toBeLessThanOrEqual(2);
    expect(v[0]).toBeGreaterThanOrEqual(0);
  });

  it('political_track component (index 3) is in [−1, +1]', () => {
    const ptHigh: HeadlessState = { ...STATE, political_track:  3 };
    const ptLow:  HeadlessState = { ...STATE, political_track: -3 };
    expect(buildStateVector(ptHigh, REF)[3]).toBeCloseTo( 1, 6);
    expect(buildStateVector(ptLow,  REF)[3]).toBeCloseTo(-1, 6);
  });

  it('different states produce different vectors', () => {
    const stateB: HeadlessState = { ...STATE, sn: 0.5, political_track: -2 };
    const va = buildStateVector(STATE,  REF);
    const vb = buildStateVector(stateB, REF);
    expect(va[0]).not.toBe(vb[0]);
  });
});

// ── softmax ───────────────────────────────────────────────────────────────────

describe('softmax()', () => {
  it('output sums to 1.0', () => {
    const s = softmax([1, 2, 3, 4]);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 10);
  });

  it('all elements are in (0, 1)', () => {
    for (const v of softmax([-10, 0, 10])) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('all-zero input → uniform distribution', () => {
    const s = softmax([0, 0, 0, 0]);
    for (const v of s) expect(v).toBeCloseTo(0.25, 10);
  });

  it('large positive dominates', () => {
    const s = softmax([100, 0, 0]);
    expect(s[0]).toBeGreaterThan(0.99);
  });
});

// ── policyAllocate ────────────────────────────────────────────────────────────

describe('policyAllocate()', () => {
  const zeroChromosome = new Float64Array(CHROMOSOME_LEN); // all zeros

  it('returns object with rations[3], materials[4], industrial[5], labour[4]', () => {
    const sv = buildStateVector(STATE, REF);
    const r = policyAllocate(zeroChromosome, sv);
    expect(r.rations).toHaveLength(3);
    expect(r.materials).toHaveLength(4);
    expect(r.industrial).toHaveLength(5);
    expect(r.labour).toHaveLength(4);
  });

  it('each fraction array sums to 1.0 (within 1e-9)', () => {
    const sv = buildStateVector(STATE, REF);
    const r = policyAllocate(zeroChromosome, sv);
    const sum = (a: number[]) => a.reduce((acc, v) => acc + v, 0);
    expect(sum(r.rations)).toBeCloseTo(1.0, 9);
    expect(sum(r.materials)).toBeCloseTo(1.0, 9);
    expect(sum(r.industrial)).toBeCloseTo(1.0, 9);
    expect(sum(r.labour)).toBeCloseTo(1.0, 9);
  });

  it('all-zero chromosome → near-uniform allocations (softmax of zeros)', () => {
    const sv = buildStateVector(STATE, REF);
    const r = policyAllocate(zeroChromosome, sv);
    // Rations: 3 outputs → each ≈ 1/3
    for (const v of r.rations)   expect(v).toBeCloseTo(1 / 3, 6);
    for (const v of r.materials)  expect(v).toBeCloseTo(1 / 4, 6);
    for (const v of r.industrial) expect(v).toBeCloseTo(1 / 5, 6);
    for (const v of r.labour)     expect(v).toBeCloseTo(1 / 4, 6);
  });

  it('all elements are in (0, 1)', () => {
    const sv = buildStateVector(STATE, REF);
    const r = policyAllocate(zeroChromosome, sv);
    for (const arr of [r.rations, r.materials, r.industrial, r.labour]) {
      for (const v of arr) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('non-zero chromosome produces different output than zero chromosome', () => {
    // Set the first rations bias (index STATE_DIM*3 = 51) to 10.
    // This gives rations logits = [10, 0, 0] → strongly skewed toward pop,
    // which is different from zero chromosome's [1/3, 1/3, 1/3].
    const biased = new Float64Array(CHROMOSOME_LEN);
    biased[STATE_DIM * 3] = 10.0;   // first rations bias (offset = STATE_DIM × RATIONS_DIM = 51)
    const sv       = buildStateVector(STATE, REF);
    const rZero    = policyAllocate(zeroChromosome, sv);
    const rBiased  = policyAllocate(biased, sv);
    const same = rZero.rations.every((v, i) => Math.abs(v - rBiased.rations[i]) < 1e-9);
    expect(same).toBe(false);
    // The biased chromosome should push strongly toward pop fraction
    expect(rBiased.rations[0]).toBeGreaterThan(0.9);
  });
});

// ── applySubsistenceFloor ─────────────────────────────────────────────────────

describe('applySubsistenceFloor()', () => {
  it('no change when pop fraction already meets subsistence', () => {
    // 0.5 × 1000 = 500 rations to population; subsistence = 40 laborers
    const fracs = [0.5, 0.3, 0.2];  // pop, export, stockpile
    const result = applySubsistenceFloor(fracs, 40, 1000);
    expect(result[0]).toBeCloseTo(0.5, 9);
    expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 9);
  });

  it('raises pop fraction when it falls below subsistence', () => {
    // 0.01 × 1000 = 10 rations to population; subsistence = 40 laborers (need 4%)
    const fracs = [0.01, 0.49, 0.50];
    const result = applySubsistenceFloor(fracs, 40, 1000);
    expect(result[0]).toBeGreaterThanOrEqual(40 / 1000 - 1e-9);
    expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 9);
  });

  it('when rationsAvailable < subsistence, pop fraction is 1.0 (give everything)', () => {
    const fracs = [0.3, 0.4, 0.3];
    const result = applySubsistenceFloor(fracs, 100, 50);  // need 100, only 50 available
    expect(result[0]).toBeCloseTo(1.0, 9);
  });

  it('output always sums to 1.0', () => {
    const cases: [number[], number, number][] = [
      [[0.1, 0.4, 0.5], 200, 1000],
      [[0.5, 0.3, 0.2],  40, 1000],
      [[0.0, 0.5, 0.5],  50,  200],
    ];
    for (const [fracs, sub, avail] of cases) {
      const r = applySubsistenceFloor(fracs, sub, avail);
      expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 9);
    }
  });
});
