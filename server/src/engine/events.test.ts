import { describe, it, expect } from 'vitest';
import type { EventEffects } from '@worldtamer/shared';
import {
  computeStormDamage,
  computeRandomEventEffect,
  computeAcclimatizationAdvance,
} from './events.js';

// ── computeStormDamage ────────────────────────────────────────────────────────
// severe_storm:      damage = max(0, roll_1d6 − colonyTL) × 5
// catastrophic_storm: damage = max(0, roll_1d20 − colonyTL) × 10
// Higher colony TL absorbs more of the roll; result floored at 0.

describe('computeStormDamage()', () => {
  // ── severe storm ──────────────────────────────────────────────────────────
  it('severe, roll 4, TL 3 → 5  ((4−3)×5)', () => {
    expect(computeStormDamage(4, 3, 'severe_storm')).toBe(5);
  });
  it('severe, roll 3, TL 3 → 0  (floor: 3−3=0)', () => {
    expect(computeStormDamage(3, 3, 'severe_storm')).toBe(0);
  });
  it('severe, roll 1, TL 8 → 0  (TL fully absorbs low roll)', () => {
    expect(computeStormDamage(1, 8, 'severe_storm')).toBe(0);
  });
  it('severe, roll 6, TL 2 → 20  ((6−2)×5)', () => {
    expect(computeStormDamage(6, 2, 'severe_storm')).toBe(20);
  });

  // ── catastrophic storm ────────────────────────────────────────────────────
  it('catastrophic, roll 15, TL 5 → 100  ((15−5)×10)', () => {
    expect(computeStormDamage(15, 5, 'catastrophic_storm')).toBe(100);
  });
  it('catastrophic, roll 3, TL 8 → 0  (floor)', () => {
    expect(computeStormDamage(3, 8, 'catastrophic_storm')).toBe(0);
  });
  it('catastrophic, roll 20, TL 8 → 120  ((20−8)×10)', () => {
    expect(computeStormDamage(20, 8, 'catastrophic_storm')).toBe(120);
  });
  it('catastrophic, roll 8, TL 8 → 0  (roll exactly equals TL)', () => {
    expect(computeStormDamage(8, 8, 'catastrophic_storm')).toBe(0);
  });
});

// ── computeRandomEventEffect ──────────────────────────────────────────────────
// Applies deterministic quantity losses from an EventEffects object to colony
// state. Returns { rations_lost, housing_lost, capital_units_destroyed }.
// Fractional losses are computed from current stockpiles.
// Effects like all_output_dm / political_dm are modifiers, not quantity losses
// — they are not computed here.

type EffectState = { rations: number; housing_m3: number };

describe('computeRandomEventEffect()', () => {
  it('vermin minor: rations_lost_fraction=0.25, rations=1000 → rations_lost=250', () => {
    const fx: EventEffects = { rations_lost_fraction: 0.25 };
    const r = computeRandomEventEffect(fx, { rations: 1000, housing_m3: 10_000 });
    expect(r.rations_lost).toBeCloseTo(250, 4);
    expect(r.housing_lost).toBe(0);
    expect(r.capital_units_destroyed).toBe(0);
  });
  it('vermin major: rations_lost_fraction=0.50, rations=800 → rations_lost=400', () => {
    const fx: EventEffects = { rations_lost_fraction: 0.50 };
    const r = computeRandomEventEffect(fx, { rations: 800, housing_m3: 5_000 });
    expect(r.rations_lost).toBeCloseTo(400, 4);
  });
  it('earthquake: housing_lost_fraction=0.10, housing=5000 → housing_lost=500', () => {
    const fx: EventEffects = { housing_lost_fraction: 0.10 };
    const r = computeRandomEventEffect(fx, { rations: 500, housing_m3: 5_000 });
    expect(r.housing_lost).toBeCloseTo(500, 4);
    expect(r.rations_lost).toBe(0);
  });
  it('animal stampede: capital_units_destroyed=10 → 10 units', () => {
    const fx: EventEffects = { capital_units_destroyed: 10 };
    const r = computeRandomEventEffect(fx, { rations: 200, housing_m3: 8_000 });
    expect(r.capital_units_destroyed).toBe(10);
  });
  it('empty effects → all zeros', () => {
    const r = computeRandomEventEffect({}, { rations: 1000, housing_m3: 10_000 });
    expect(r.rations_lost).toBe(0);
    expect(r.housing_lost).toBe(0);
    expect(r.capital_units_destroyed).toBe(0);
  });
  it('rations_lost_fraction with zero stockpile → 0 lost', () => {
    const fx: EventEffects = { rations_lost_fraction: 0.25 };
    const r = computeRandomEventEffect(fx, { rations: 0, housing_m3: 0 });
    expect(r.rations_lost).toBe(0);
  });
});

// ── computeAcclimatizationAdvance ─────────────────────────────────────────────
// WTH difficulty thresholds (D20 roll required to advance):
//   Stage 1 → 2: roll ≥ 16
//   Stage 2 → 3: roll ≥ 13
//   Stage 3 → 4: roll ≥ 10
//   Stage 4 → 5: roll ≥  7
//   Stage 5:     fully acclimatized — no change

describe('computeAcclimatizationAdvance()', () => {
  it('stage 1, roll 16 → 2  (meets threshold)', () => {
    expect(computeAcclimatizationAdvance(1, 16)).toBe(2);
  });
  it('stage 1, roll 15 → 1  (below threshold)', () => {
    expect(computeAcclimatizationAdvance(1, 15)).toBe(1);
  });
  it('stage 2, roll 13 → 3  (meets threshold)', () => {
    expect(computeAcclimatizationAdvance(2, 13)).toBe(3);
  });
  it('stage 2, roll 12 → 2  (below threshold)', () => {
    expect(computeAcclimatizationAdvance(2, 12)).toBe(2);
  });
  it('stage 3, roll 10 → 4  (meets threshold)', () => {
    expect(computeAcclimatizationAdvance(3, 10)).toBe(4);
  });
  it('stage 3, roll 9 → 3  (below threshold)', () => {
    expect(computeAcclimatizationAdvance(3, 9)).toBe(3);
  });
  it('stage 4, roll 7 → 5  (meets threshold)', () => {
    expect(computeAcclimatizationAdvance(4, 7)).toBe(5);
  });
  it('stage 4, roll 6 → 4  (below threshold)', () => {
    expect(computeAcclimatizationAdvance(4, 6)).toBe(4);
  });
  it('stage 5, roll 20 → 5  (already fully acclimatized)', () => {
    expect(computeAcclimatizationAdvance(5, 20)).toBe(5);
  });
});
