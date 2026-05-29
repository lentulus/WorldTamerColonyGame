import { describe, it, expect, beforeEach } from 'vitest';
import { initColonyDb } from '../db/colony.js';
import {
  lookupOutputMultiplier,
  applyOutputDMs,
  lookupWeatherOutcome,
  lookupPoliticalOutcome,
} from './rolls.js';

// Seed an in-memory DB before each test so the lookup functions have data.
beforeEach(() => initColonyDb(':memory:'));

// ── lookupOutputMultiplier ────────────────────────────────────────────────────
// ref_output_roll bands: 1→0.80, 2-3→0.85, 4-5→0.90, 6-7→0.95, 8-13→1.00,
//                        14-15→1.05, 16-17→1.10, 18-19→1.15, 20+→1.20

describe('lookupOutputMultiplier()', () => {
  it('roll 1 → 0.80 (minimum band, single-value)', () => {
    expect(lookupOutputMultiplier(1)).toBe(0.80);
  });
  it('roll 2 → 0.85 (lower edge of 2–3 band)', () => {
    expect(lookupOutputMultiplier(2)).toBe(0.85);
  });
  it('roll 3 → 0.85 (upper edge of 2–3 band)', () => {
    expect(lookupOutputMultiplier(3)).toBe(0.85);
  });
  it('roll 7 → 0.95 (upper boundary before neutral band)', () => {
    expect(lookupOutputMultiplier(7)).toBe(0.95);
  });
  it('roll 8 → 1.00 (lower boundary of neutral band)', () => {
    expect(lookupOutputMultiplier(8)).toBe(1.00);
  });
  it('roll 13 → 1.00 (upper boundary of neutral band)', () => {
    expect(lookupOutputMultiplier(13)).toBe(1.00);
  });
  it('roll 14 → 1.05 (first positive-modifier band)', () => {
    expect(lookupOutputMultiplier(14)).toBe(1.05);
  });
  it('roll 20 → 1.20 (natural D20 max)', () => {
    expect(lookupOutputMultiplier(20)).toBe(1.20);
  });
  it('roll 25 → 1.20 (adjusted roll above D20 max; upper sentinel covers it)', () => {
    expect(lookupOutputMultiplier(25)).toBe(1.20);
  });
  it('roll −4 → 0.80 (clamped to lower bound; heavy DMs on a low raw roll)', () => {
    expect(lookupOutputMultiplier(-4)).toBe(0.80);
  });
});

// ── applyOutputDMs ────────────────────────────────────────────────────────────
// Pure sum of the four DM sources. Controlled economy DM (always −1) is passed
// as baseDM by the caller. No DB access.

describe('applyOutputDMs()', () => {
  it('all zeros → 0', () => {
    expect(applyOutputDMs(0, 0, 0, 0)).toBe(0);
  });
  it('controlled economy alone: (−1, 0, 0, 0) → −1', () => {
    expect(applyOutputDMs(-1, 0, 0, 0)).toBe(-1);
  });
  it('controlled economy + productive political cancel: (−1, +1, 0, 0) → 0', () => {
    expect(applyOutputDMs(-1, 1, 0, 0)).toBe(0);
  });
  it('pile of penalties: (−1, −4, −2, −1) → −8', () => {
    expect(applyOutputDMs(-1, -4, -2, -1)).toBe(-8);
  });
  it('positive pile: (0, +2, +1, 0) → +3', () => {
    expect(applyOutputDMs(0, 2, 1, 0)).toBe(3);
  });
});

// ── lookupWeatherOutcome ──────────────────────────────────────────────────────
// ref_weather_outcomes: ≤14→'none', 15-17→'drought',
//                       18-19→'severe_storm', ≥20→'catastrophic_storm'

describe('lookupWeatherOutcome()', () => {
  it('roll 5 → none (interior of safe band)', () => {
    expect(lookupWeatherOutcome(5)).toBe('none');
  });
  it('roll 14 → none (upper boundary of safe band)', () => {
    expect(lookupWeatherOutcome(14)).toBe('none');
  });
  it('roll −5 → none (below lower sentinel, still maps to safe band)', () => {
    expect(lookupWeatherOutcome(-5)).toBe('none');
  });
  it('roll 15 → drought (lower boundary)', () => {
    expect(lookupWeatherOutcome(15)).toBe('drought');
  });
  it('roll 17 → drought (upper boundary)', () => {
    expect(lookupWeatherOutcome(17)).toBe('drought');
  });
  it('roll 18 → severe_storm (lower boundary)', () => {
    expect(lookupWeatherOutcome(18)).toBe('severe_storm');
  });
  it('roll 19 → severe_storm (upper boundary)', () => {
    expect(lookupWeatherOutcome(19)).toBe('severe_storm');
  });
  it('roll 20 → catastrophic_storm (D20 max / lower boundary)', () => {
    expect(lookupWeatherOutcome(20)).toBe('catastrophic_storm');
  });
  it('roll 25 → catastrophic_storm (adjusted roll; upper sentinel covers it)', () => {
    expect(lookupWeatherOutcome(25)).toBe('catastrophic_storm');
  });
});

// ── lookupPoliticalOutcome ────────────────────────────────────────────────────
// Returns { event_label, output_dm, affected_sectors, track_movement }.
// Table uses −999/+999 sentinels so any adjusted roll finds a row.

describe('lookupPoliticalOutcome()', () => {
  it('roll −10 → Coup Attempt, output_dm −5, track −2  (lower sentinel)', () => {
    const r = lookupPoliticalOutcome(-10);
    expect(r.event_label).toBe('Coup Attempt');
    expect(r.output_dm).toBe(-5);
    expect(r.track_movement).toBe(-2);
  });
  it('roll −4 → Severe Riots, output_dm −4, track −2', () => {
    const r = lookupPoliticalOutcome(-4);
    expect(r.event_label).toBe('Severe Riots');
    expect(r.output_dm).toBe(-4);
    expect(r.track_movement).toBe(-2);
  });
  it('roll −3 → Assassination Attempt, output_dm −4, track −1  (different from −4 band)', () => {
    const r = lookupPoliticalOutcome(-3);
    expect(r.event_label).toBe('Assassination Attempt');
    expect(r.output_dm).toBe(-4);
    expect(r.track_movement).toBe(-1);
  });
  it('roll 10 → No Effect, output_dm 0, track 0  (interior of 6–15 band)', () => {
    const r = lookupPoliticalOutcome(10);
    expect(r.event_label).toBe('No Effect');
    expect(r.output_dm).toBe(0);
    expect(r.track_movement).toBe(0);
  });
  it('roll 15 → No Effect  (upper boundary of 6–15 band)', () => {
    expect(lookupPoliticalOutcome(15).event_label).toBe('No Effect');
  });
  it('roll 16 → Productive, output_dm +1, one_random sectors, track 0', () => {
    const r = lookupPoliticalOutcome(16);
    expect(r.event_label).toBe('Productive');
    expect(r.output_dm).toBe(1);
    expect(r.affected_sectors).toBe('one_random');
    expect(r.track_movement).toBe(0);
  });
  it('roll 20 → Productive, output_dm +1, all sectors  (different band from roll 16)', () => {
    const r = lookupPoliticalOutcome(20);
    expect(r.event_label).toBe('Productive');
    expect(r.output_dm).toBe(1);
    expect(r.affected_sectors).toBe('all');
    expect(r.track_movement).toBe(0);
  });
  it('roll 25 → Excellent, output_dm +2, track +2  (upper sentinel)', () => {
    const r = lookupPoliticalOutcome(25);
    expect(r.event_label).toBe('Excellent');
    expect(r.output_dm).toBe(2);
    expect(r.track_movement).toBe(2);
  });
  it('roll 30 → Excellent  (well into upper sentinel range)', () => {
    expect(lookupPoliticalOutcome(30).event_label).toBe('Excellent');
  });
});
