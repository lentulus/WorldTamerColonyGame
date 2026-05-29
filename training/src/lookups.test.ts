import { describe, it, expect } from 'vitest';
import { REF } from './ref_data.js';
import {
  lookupOutputMultiplierH,
  lookupWeatherOutcomeH,
  lookupPoliticalOutcomeH,
  snDMsH,
  ssPoliticalDMH,
  getSlBaselineH,
} from './lookups.js';

// ── lookupOutputMultiplierH ───────────────────────────────────────────────────
// Matches the server's lookupOutputMultiplier (clamped to roll ≥ 1).

describe('lookupOutputMultiplierH()', () => {
  it('roll  1 → 0.80', () => expect(lookupOutputMultiplierH( 1, REF)).toBe(0.80));
  it('roll  2 → 0.85', () => expect(lookupOutputMultiplierH( 2, REF)).toBe(0.85));
  it('roll  8 → 1.00', () => expect(lookupOutputMultiplierH( 8, REF)).toBe(1.00));
  it('roll 14 → 1.05', () => expect(lookupOutputMultiplierH(14, REF)).toBe(1.05));
  it('roll 20 → 1.20', () => expect(lookupOutputMultiplierH(20, REF)).toBe(1.20));
  it('roll 25 → 1.20  (capped at table max)', () => expect(lookupOutputMultiplierH(25, REF)).toBe(1.20));
  it('roll  0 → 0.80  (clamped to minimum 1)', () => expect(lookupOutputMultiplierH( 0, REF)).toBe(0.80));
  it('roll -5 → 0.80  (clamped to minimum 1)', () => expect(lookupOutputMultiplierH(-5, REF)).toBe(0.80));
});

// ── lookupWeatherOutcomeH ─────────────────────────────────────────────────────

describe('lookupWeatherOutcomeH()', () => {
  it('adjusted  1 → none',               () => expect(lookupWeatherOutcomeH( 1, REF)).toBe('none'));
  it('adjusted 14 → none',               () => expect(lookupWeatherOutcomeH(14, REF)).toBe('none'));
  it('adjusted 15 → drought',            () => expect(lookupWeatherOutcomeH(15, REF)).toBe('drought'));
  it('adjusted 17 → drought',            () => expect(lookupWeatherOutcomeH(17, REF)).toBe('drought'));
  it('adjusted 18 → severe_storm',       () => expect(lookupWeatherOutcomeH(18, REF)).toBe('severe_storm'));
  it('adjusted 19 → severe_storm',       () => expect(lookupWeatherOutcomeH(19, REF)).toBe('severe_storm'));
  it('adjusted 20 → catastrophic_storm', () => expect(lookupWeatherOutcomeH(20, REF)).toBe('catastrophic_storm'));
  it('adjusted 99 → catastrophic_storm', () => expect(lookupWeatherOutcomeH(99, REF)).toBe('catastrophic_storm'));
});

// ── lookupPoliticalOutcomeH ───────────────────────────────────────────────────

describe('lookupPoliticalOutcomeH()', () => {
  it('adjusted 10 → No Effect, output_dm=0, movement=0', () => {
    const r = lookupPoliticalOutcomeH(10, REF);
    expect(r.event_label).toBe('No Effect');
    expect(r.output_dm).toBe(0);
    expect(r.track_movement).toBe(0);
    expect(r.affected_sectors).toBe('none');
  });
  it('adjusted 25 → Excellent, movement=+2', () => {
    const r = lookupPoliticalOutcomeH(25, REF);
    expect(r.event_label).toBe('Excellent');
    expect(r.track_movement).toBe(2);
  });
  it('adjusted -10 → Coup Attempt, output_dm=-5, movement=-2', () => {
    const r = lookupPoliticalOutcomeH(-10, REF);
    expect(r.event_label).toBe('Coup Attempt');
    expect(r.output_dm).toBe(-5);
    expect(r.track_movement).toBe(-2);
  });
  it('adjusted 16 → Productive, one_random affected', () => {
    const r = lookupPoliticalOutcomeH(16, REF);
    expect(r.event_label).toBe('Productive');
    expect(r.affected_sectors).toBe('one_random');
  });
});

// ── snDMsH ────────────────────────────────────────────────────────────────────

describe('snDMsH()', () => {
  it('SN 1.0 → output_dm=0, political_dm=0', () => {
    const r = snDMsH(1.0, REF);
    expect(r.output_dm).toBe(0);
    expect(r.political_dm).toBe(0);
  });
  it('SN 0.5 → output_dm=-8, political_dm=-4 (famine)', () => {
    const r = snDMsH(0.5, REF);
    expect(r.output_dm).toBe(-8);
    expect(r.political_dm).toBe(-4);
  });
  it('SN 0.9 → output_dm=-1 (marginal)', () => {
    expect(snDMsH(0.9, REF).output_dm).toBe(-1);
  });
  it('SN 1.5 → output_dm=0, political_dm=+1 (surplus)', () => {
    const r = snDMsH(1.5, REF);
    expect(r.output_dm).toBe(0);
    expect(r.political_dm).toBe(1);
  });
  it('SN 0.0 → falls into lowest band (output_dm=-8)', () => {
    expect(snDMsH(0.0, REF).output_dm).toBe(-8);
  });
});

// ── ssPoliticalDMH ────────────────────────────────────────────────────────────

describe('ssPoliticalDMH()', () => {
  it('SS 100 → 0  (neutral 81–120 band)', () => expect(ssPoliticalDMH(100, REF)).toBe(0));
  it('SS  20 → -3 (overcrowded)', ()       => expect(ssPoliticalDMH( 20, REF)).toBe(-3));
  it('SS  50 → -2',               ()       => expect(ssPoliticalDMH( 50, REF)).toBe(-2));
  it('SS 200 → +2 (spacious)',    ()       => expect(ssPoliticalDMH(200, REF)).toBe(2));
});

// ── getSlBaselineH ────────────────────────────────────────────────────────────

describe('getSlBaselineH()', () => {
  it('home TL 8 → 250 Cr',  () => expect(getSlBaselineH(8,  REF)).toBe(250));
  it('home TL 0 → 5 Cr',    () => expect(getSlBaselineH(0,  REF)).toBe(5));
  it('home TL 15 → 2500 Cr',() => expect(getSlBaselineH(15, REF)).toBe(2500));
  it('home TL 12 → 1500 Cr',() => expect(getSlBaselineH(12, REF)).toBe(1500));
});
