import { describe, it, expect } from 'vitest';
import { computeWeatherFactor, computePhiMin } from './founding.js';

// ── computeWeatherFactor ──────────────────────────────────────────────────────
// WTH rules: star DM (A=+4, F=+2, K=−1, M=−2, others=0)
//            tilt DM (0°=−2, 1–10°=−1, 11–19°=0, 20–29°=+1, 30–44°=+2, ≥45°=+4)
//            hydro DM (code 5+ = +1)

describe('computeWeatherFactor()', () => {
  it('G star, 23° tilt, hydro 7 → +2  (0 + 1 + 1)', () => {
    expect(computeWeatherFactor('G2V', 23, 7)).toBe(2);
  });
  it('A star, 0° tilt, hydro 3 → +2  (+4 − 2 + 0)', () => {
    expect(computeWeatherFactor('A5V', 0, 3)).toBe(2);
  });
  it('M star, 91° tilt, hydro 8 → +3  (−2 + 4 + 1)', () => {
    expect(computeWeatherFactor('M1V', 91, 8)).toBe(3);
  });
  it('K star, 15° tilt, hydro 4 → −1  (−1 + 0 + 0)', () => {
    expect(computeWeatherFactor('K5V', 15, 4)).toBe(-1);
  });
  it('F star, 5° tilt, hydro 6 → +2  (+2 − 1 + 1)', () => {
    expect(computeWeatherFactor('F5', 5, 6)).toBe(2);
  });
  it('G star, exactly 10° tilt → tilt DM = −1', () => {
    expect(computeWeatherFactor('G0', 10, 0)).toBe(-1);
  });
  it('G star, exactly 20° tilt → tilt DM = +1', () => {
    expect(computeWeatherFactor('G0', 20, 0)).toBe(1);
  });
  it('G star, exactly 45° tilt → tilt DM = +4', () => {
    expect(computeWeatherFactor('G0', 45, 0)).toBe(4);
  });
  it('uses only the first character of spectral string', () => {
    expect(computeWeatherFactor('K0Ia', 15, 0)).toBe(-1);
  });
});

// ── computePhiMin ─────────────────────────────────────────────────────────────
// Formula: tidally locked → 0.25
//          else clamp(0.80 − axialTilt/90 × 0.70, 0.10, 0.90)

describe('computePhiMin()', () => {
  it('tidally locked → 0.25 regardless of tilt', () => {
    expect(computePhiMin(30, true)).toBe(0.25);
  });
  it('0° tilt, not locked → 0.80', () => {
    expect(computePhiMin(0, false)).toBeCloseTo(0.80, 5);
  });
  it('45° tilt → 0.45  (0.80 − 45/90 × 0.70 = 0.80 − 0.35)', () => {
    expect(computePhiMin(45, false)).toBeCloseTo(0.45, 5);
  });
  it('90° tilt → exactly at lower clamp: 0.10  (0.80 − 0.70 = 0.10)', () => {
    expect(computePhiMin(90, false)).toBeCloseTo(0.10, 5);
  });
  it('120° tilt → clamped to 0.10 (raw would be −0.13)', () => {
    expect(computePhiMin(120, false)).toBe(0.10);
  });
  it('23.4° tilt → ≈ 0.618  (0.80 − 23.4/90 × 0.70)', () => {
    expect(computePhiMin(23.4, false)).toBeCloseTo(0.618, 2);
  });
});
