import { describe, it, expect } from 'vitest';
import {
  computeM,
  computePhiT,
  computeQA,
  computeSN,
  computeQM,
  computePowerFactor,
  computeQI,
  computeSS,
  computeSLDecay,
  computeSLReplenishment,
  computeSLIndex,
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

// ── computeQI ─────────────────────────────────────────────────────────────────
// Industrial output (credits).
// Q_I = M_I × q_I × eta × powerFactor
// No seasonal factor; no R_A (materials supply is player-allocated separately).
// TL 8: output_cr_per_il_month = 1500 (from ref_industry_tl seed).

describe('computeQI()', () => {
  it('TL 8 baseline: (20, 1500, 1, 1) → 30 000  (M_I=20 × q_I=1500)', () => {
    expect(computeQI(20, 1500, 1, 1)).toBe(30_000);
  });
  it('road penalty: (20, 1500, 0.6, 1) → 18 000  (×0.6 eta)', () => {
    expect(computeQI(20, 1500, 0.6, 1)).toBeCloseTo(18_000, 4);
  });
  it('half power: (20, 1500, 1, 0.5) → 15 000', () => {
    expect(computeQI(20, 1500, 1, 0.5)).toBeCloseTo(15_000, 4);
  });
  it('no laborers: (0, 1500, 1, 1) → 0', () => {
    expect(computeQI(0, 1500, 1, 1)).toBe(0);
  });
});

// ── computeSS ─────────────────────────────────────────────────────────────────
// Standard of Shelter = housing_m3 / totalLaborers (raw m³ per laborer).
// ref_ss_table bands: 0–24, 25–50, 51–80, 81–120, 121–160, 161–250, 251–350, 351+

describe('computeSS()', () => {
  it('(2400, 100) → 24.0  (top of worst band)', () => {
    expect(computeSS(2400, 100)).toBeCloseTo(24.0, 6);
  });
  it('(2500, 100) → 25.0  (bottom of next band)', () => {
    expect(computeSS(2500, 100)).toBeCloseTo(25.0, 6);
  });
  it('(10000, 100) → 100.0  (neutral 81–120 band)', () => {
    expect(computeSS(10_000, 100)).toBeCloseTo(100.0, 6);
  });
  it('(35000, 100) → 350.0  (top of 251–350 band)', () => {
    expect(computeSS(35_000, 100)).toBeCloseTo(350.0, 6);
  });
  it('(0, 100) → 0.0', () => {
    expect(computeSS(0, 100)).toBe(0);
  });
  it('zero laborers → 0  (guard against division by zero)', () => {
    expect(computeSS(10_000, 0)).toBe(0);
  });
});

// ── computeSLDecay ────────────────────────────────────────────────────────────
// SL goods value decays 2% per month: prev × 0.98

describe('computeSLDecay()', () => {
  it('(1000) → 980  (1000 × 0.98)', () => {
    expect(computeSLDecay(1000)).toBeCloseTo(980, 6);
  });
  it('(250) → 245  (TL 8 baseline × 0.98)', () => {
    expect(computeSLDecay(250)).toBeCloseTo(245, 6);
  });
  it('(0) → 0', () => {
    expect(computeSLDecay(0)).toBe(0);
  });
});

// ── computeSLReplenishment ────────────────────────────────────────────────────
// Credits allocated to consumer goods → added SL value per person.

describe('computeSLReplenishment()', () => {
  it('(1000, 100) → 10.0  (1000 Cr ÷ 100 laborers)', () => {
    expect(computeSLReplenishment(1000, 100)).toBeCloseTo(10.0, 6);
  });
  it('(5000, 200) → 25.0', () => {
    expect(computeSLReplenishment(5000, 200)).toBeCloseTo(25.0, 6);
  });
  it('(0, 100) → 0', () => {
    expect(computeSLReplenishment(0, 100)).toBe(0);
  });
});

// ── computeSLIndex ────────────────────────────────────────────────────────────
// DM from SL ratio (sl_value / baseline_sl_value).
// Bands: ≥1.20→+2, [1.05,1.20)→+1, [0.95,1.05)→0, [0.75,0.95)→−1,
//        [0.50,0.75)→−2, <0.50→−3

describe('computeSLIndex()', () => {
  it('at baseline (200/200 = 1.0) → 0', () => {
    expect(computeSLIndex(200, 200)).toBe(0);
  });
  it('lower neutral edge (190/200 = 0.95) → 0', () => {
    expect(computeSLIndex(190, 200)).toBe(0);
  });
  it('just below neutral (188/200 = 0.94) → −1', () => {
    expect(computeSLIndex(188, 200)).toBe(-1);
  });
  it('above baseline (210/200 = 1.05) → +1  (lower edge of +1 band)', () => {
    expect(computeSLIndex(210, 200)).toBe(1);
  });
  it('well above (240/200 = 1.20) → +2  (lower edge of +2 band)', () => {
    expect(computeSLIndex(240, 200)).toBe(2);
  });
  it('falling: below half of baseline (90/200 = 0.45) → −3', () => {
    expect(computeSLIndex(90, 200)).toBe(-3);
  });
  it('mid-decline (130/200 = 0.65) → −2', () => {
    expect(computeSLIndex(130, 200)).toBe(-2);
  });
  it('mild decline (180/200 = 0.90) → −1', () => {
    expect(computeSLIndex(180, 200)).toBe(-1);
  });
});
