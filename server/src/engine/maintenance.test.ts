import { describe, it, expect } from 'vitest';
import {
  computeMaintenanceCost,
  computeInfrastructureEfficiency,
  computeRoadRequirement,
} from './maintenance.js';

// ── computeMaintenanceCost ────────────────────────────────────────────────────
// Monthly maintenance rate on capital value, age-gated (WTH Ch.5):
//   months   0–119: 0%
//   months 120–131: 0.1% / month
//   months 132–143: 0.2% / month
//   months 144–155: 0.3% / month
//   months   156+:  0.4% / month
// capitalType is carried through for future differentiation; all types use the
// same schedule now.

describe('computeMaintenanceCost()', () => {
  it('age 0 → 0  (new colony, no maintenance)', () => {
    expect(computeMaintenanceCost(0, 100_000, 'ac')).toBe(0);
  });
  it('age 119 → 0  (last month of free period)', () => {
    expect(computeMaintenanceCost(119, 100_000, 'ac')).toBe(0);
  });
  it('age 120 → 100  (0.1% × 100 000)', () => {
    expect(computeMaintenanceCost(120, 100_000, 'ac')).toBeCloseTo(100, 4);
  });
  it('age 131 → 100  (still in 0.1% band)', () => {
    expect(computeMaintenanceCost(131, 100_000, 'ic')).toBeCloseTo(100, 4);
  });
  it('age 132 → 200  (0.2% × 100 000)', () => {
    expect(computeMaintenanceCost(132, 100_000, 'mc')).toBeCloseTo(200, 4);
  });
  it('age 143 → 200  (still in 0.2% band)', () => {
    expect(computeMaintenanceCost(143, 100_000, 'ac')).toBeCloseTo(200, 4);
  });
  it('age 144 → 300  (0.3% × 100 000)', () => {
    expect(computeMaintenanceCost(144, 100_000, 'ac')).toBeCloseTo(300, 4);
  });
  it('age 155 → 300  (still in 0.3% band)', () => {
    expect(computeMaintenanceCost(155, 100_000, 'ic')).toBeCloseTo(300, 4);
  });
  it('age 156 → 400  (0.4% × 100 000)', () => {
    expect(computeMaintenanceCost(156, 100_000, 'ac')).toBeCloseTo(400, 4);
  });
  it('age 200 → 400  (plateau at 0.4%)', () => {
    expect(computeMaintenanceCost(200, 100_000, 'mc')).toBeCloseTo(400, 4);
  });
  it('scales with capital value: age 120, value 500 000 → 500', () => {
    expect(computeMaintenanceCost(120, 500_000, 'ac')).toBeCloseTo(500, 4);
  });
  it('zero capital value → 0 at any age', () => {
    expect(computeMaintenanceCost(156, 0, 'ac')).toBe(0);
  });
});

// ── computeInfrastructureEfficiency ──────────────────────────────────────────
// 0.60 when roads are not yet complete; 1.0 when roads are complete.
// Applied to all non-construction sector output.

describe('computeInfrastructureEfficiency()', () => {
  it('roads not complete → 0.60', () => {
    expect(computeInfrastructureEfficiency(false)).toBeCloseTo(0.60, 6);
  });
  it('roads complete → 1.0', () => {
    expect(computeInfrastructureEfficiency(true)).toBe(1.0);
  });
});

// ── computeRoadRequirement ────────────────────────────────────────────────────
// Road length needed = inhabited_hex_count × 500 km.
// The credit cost is derived by the caller from ref_transport_tl.cost_mcr_per_km
// at the colony's TL.

describe('computeRoadRequirement()', () => {
  it('0 hexes → 0 km', () => {
    expect(computeRoadRequirement(0)).toBe(0);
  });
  it('1 hex → 500 km', () => {
    expect(computeRoadRequirement(1)).toBe(500);
  });
  it('5 hexes → 2 500 km', () => {
    expect(computeRoadRequirement(5)).toBe(2_500);
  });
  it('10 hexes → 5 000 km', () => {
    expect(computeRoadRequirement(10)).toBe(5_000);
  });
});
