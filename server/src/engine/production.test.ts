import { describe, it, expect } from 'vitest';
import {
  computeM,
  computePhiT,
  computeQA,
  computeSN,
  computeQM,
  computePowerFactor,
} from './production.js';

// ── computeM ──────────────────────────────────────────────────────────────────
// Matching factor for labor × capital.
// labor > capital  → M = min(labor, capital × 1.5)  (excess workers capped)
// capital ≥ labor  → M = min(capital, labor × 1.25) (excess capital capped)

describe('computeM()', () => {
  it('labor < capital, not at cap: (90, 100) → 100  (min(100, 112.5) = capital)', () => {
    expect(computeM(90, 100)).toBe(100);
  });
  it('labor = capital: (100, 100) → 100', () => {
    expect(computeM(100, 100)).toBe(100);
  });
  it('labor > capital, not yet capped: (130, 100) → 130  (min(130, 150) = labor)', () => {
    expect(computeM(130, 100)).toBe(130);
  });
  it('labor > capital, capped at 1.5×capital: (200, 100) → 150  (min(200, 150))', () => {
    expect(computeM(200, 100)).toBe(150);
  });
  it('capital > labor, capped at 1.25×labor: (60, 200) → 75  (min(200, 75))', () => {
    expect(computeM(60, 200)).toBe(75);
  });
});

// ── computePhiT ───────────────────────────────────────────────────────────────
// Seasonal growing factor.
// φ(t) = phiMin + (1 − phiMin) × 0.5 × (1 + sin(2π(t − orbitMonths/4) / orbitMonths))
// Trough at t = 0: sin(−π/2) = −1 → φ = phiMin
// Peak  at t = orbitMonths/2: sin(π/2) = 1 → φ = 1.0
// Midpoint at t = orbitMonths/4: sin(0) = 0 → φ = (phiMin + 1) / 2

describe('computePhiT()', () => {
  it('t = 0 → phiMin (trough; sin = −1)', () => {
    expect(computePhiT(0, 12, 0.4)).toBeCloseTo(0.4, 6);
  });
  it('t = orbitMonths/2 → 1.0 (peak; sin = +1)', () => {
    expect(computePhiT(6, 12, 0.4)).toBeCloseTo(1.0, 6);
  });
  it('t = orbitMonths/4 → midpoint 0.7  ((0.4 + 1.0) / 2; sin = 0)', () => {
    expect(computePhiT(3, 12, 0.4)).toBeCloseTo(0.7, 6);
  });
  it('value at trough < value at midpoint < value at peak', () => {
    const lo = computePhiT(0,  12, 0.4);
    const mid = computePhiT(3, 12, 0.4);
    const hi = computePhiT(6,  12, 0.4);
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
  });
  it('phiMin = 0 gives trough = 0.0 and peak = 1.0', () => {
    expect(computePhiT(0, 12, 0)).toBeCloseTo(0.0, 6);
    expect(computePhiT(6, 12, 0)).toBeCloseTo(1.0, 6);
  });
});

// ── computeQA ─────────────────────────────────────────────────────────────────
// Agricultural output (rations).
// Q_A = M_A × q_A × R_A × phi × eta × powerFactor
// All six are multiplied together; any factor = 0 collapses output to 0.

describe('computeQA()', () => {
  it('all factors 1.0: (10, 27, 1, 1, 1, 1) → 270  (TL 8 agriculture, 10 effective units)', () => {
    expect(computeQA(10, 27, 1, 1, 1, 1)).toBeCloseTo(270, 6);
  });
  it('trough season phi = 0.4: (10, 27, 1, 0.4, 1, 1) → 108  (270 × 0.4)', () => {
    expect(computeQA(10, 27, 1, 0.4, 1, 1)).toBeCloseTo(108, 6);
  });
  it('combined penalties: (10, 27, 0.5, 1, 0.6, 0.8) → 64.8  (270 × 0.5 × 0.6 × 0.8)', () => {
    expect(computeQA(10, 27, 0.5, 1, 0.6, 0.8)).toBeCloseTo(64.8, 4);
  });
  it('powerFactor = 0 → output = 0 (no power, no output)', () => {
    expect(computeQA(10, 27, 1, 1, 1, 0)).toBe(0);
  });
});

// ── computeSN ─────────────────────────────────────────────────────────────────
// Standard of Nutrition = rations allocated to population / total laborers.
// SN = 1.0 when allocation exactly meets subsistence (1 ration per laborer).

describe('computeSN()', () => {
  it('exactly adequate: (100, 100) → 1.0', () => {
    expect(computeSN(100, 100)).toBeCloseTo(1.0, 6);
  });
  it('below adequate: (75, 100) → 0.75', () => {
    expect(computeSN(75, 100)).toBeCloseTo(0.75, 6);
  });
  it('surplus: (270, 100) → 2.7  (10 TL-8 agricultural laborers feeding 100)', () => {
    expect(computeSN(270, 100)).toBeCloseTo(2.7, 6);
  });
  it('zero allocation → 0.0', () => {
    expect(computeSN(0, 100)).toBe(0);
  });
  it('scales proportionally with allocation', () => {
    expect(computeSN(200, 100)).toBeCloseTo(2.0, 6);
    expect(computeSN(50, 100)).toBeCloseTo(0.5, 6);
  });
});

// ── computeQM ─────────────────────────────────────────────────────────────────
// Raw materials output.
// Q_M = M_M × q_M × 2^(rvm/3) × eta × powerFactor
// richness modifier: rvm=0→×1, rvm=3→×2, rvm=−3→×0.5

describe('computeQM()', () => {
  it('rvm = 0 (neutral richness): (10, 450, 0, 1, 1) → 4500  (TL 8, ×1.0)', () => {
    expect(computeQM(10, 450, 0, 1, 1)).toBeCloseTo(4500, 4);
  });
  it('rvm = +3 (double richness): (10, 450, 3, 1, 1) → 9000  (×2)', () => {
    expect(computeQM(10, 450, 3, 1, 1)).toBeCloseTo(9000, 4);
  });
  it('rvm = −3 (half richness): (10, 450, -3, 1, 1) → 2250  (×0.5)', () => {
    expect(computeQM(10, 450, -3, 1, 1)).toBeCloseTo(2250, 4);
  });
  it('infrastructure penalty: (10, 450, 0, 0.6, 1) → 2700  (270 × 0.6)', () => {
    expect(computeQM(10, 450, 0, 0.6, 1)).toBeCloseTo(2700, 4);
  });
  it('powerFactor = 0 → 0', () => {
    expect(computeQM(10, 450, 0, 1, 0)).toBe(0);
  });
});

// ── computePowerFactor ────────────────────────────────────────────────────────
// powerFactor = min(1, available_kw / required_kw)
// required_kw = ic_total × industry_kw_per_unit + mc × materials_kw_per_unit
// Agriculture has no power draw (not in ref_agriculture_tl).
// If no power is required, returns 1.0 (pre-industrial TL).

describe('computePowerFactor()', () => {
  it('exactly sufficient: powerKw=18, ic=10, mc=5, ikw=1.2, mkw=1.2 → 1.0  (10×1.2+5×1.2=18)', () => {
    expect(computePowerFactor(18, 10, 5, 1.2, 1.2)).toBeCloseTo(1.0, 6);
  });
  it('half power: powerKw=9, same capital → 0.5', () => {
    expect(computePowerFactor(9, 10, 5, 1.2, 1.2)).toBeCloseTo(0.5, 6);
  });
  it('excess power is clamped to 1.0: powerKw=36 → 1.0', () => {
    expect(computePowerFactor(36, 10, 5, 1.2, 1.2)).toBe(1.0);
  });
  it('no power → 0.0', () => {
    expect(computePowerFactor(0, 10, 5, 1.2, 1.2)).toBe(0);
  });
  it('no capital requires no power → 1.0  (pre-industrial)', () => {
    expect(computePowerFactor(0, 0, 0, 1.2, 1.2)).toBe(1.0);
  });
});
