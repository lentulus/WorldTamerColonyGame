import { describe, it, expect, beforeAll } from 'vitest';
import { getHabitableWorlds, getWorldById } from './meridian.js';
import type { WorldCandidate } from '@worldtamer/shared';

// Integration tests against the live Meridian parquet data.
// DuckDB takes a few seconds to initialise on first call.

const TIMEOUT = 30_000;
const NEARBY = { max_dist_pc: 20 };  // Sol-centred, 20 pc radius

describe('getHabitableWorlds()', () => {
  let worlds: WorldCandidate[];

  beforeAll(async () => {
    worlds = await getHabitableWorlds(NEARBY);
  }, TIMEOUT);

  it('returns at least one world within 20 pc of Sol', () => {
    expect(worlds.length).toBeGreaterThan(0);
  });

  it('every result has world_type containing "Garden"', () => {
    for (const w of worlds) {
      expect(w.world_type, `body_id ${w.body_id}`).toContain('Garden');
    }
  });

  it('every result has habitability >= 1', () => {
    for (const w of worlds) {
      expect(w.habitability, `body_id ${w.body_id}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('every result has dist_pc <= 20', () => {
    for (const w of worlds) {
      expect(w.dist_pc, `body_id ${w.body_id}`).toBeLessThanOrEqual(20);
    }
  });

  it('every result has body_position >= 1', () => {
    for (const w of worlds) {
      expect(w.body_position, `body_id ${w.body_id}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('all 8 founding fields are present with correct types', () => {
    for (const w of worlds) {
      expect(w.body_id).toBeTruthy();
      expect(w.system_id).toBeTruthy();
      expect(w.system_name).toBeTruthy();
      expect(w.atmosphere_code).toBeTruthy();
      expect(w.star_spectral).toBeTruthy();
      expect(typeof w.hydrographics_code).toBe('number');
      expect(typeof w.axial_tilt_deg).toBe('number');
      expect(typeof w.orbit_au).toBe('number');
      expect(w.orbit_au).toBeGreaterThan(0);
      expect(typeof w.rvm).toBe('number');
      expect(typeof w.dist_pc).toBe('number');
    }
  });

  it('results are sorted by distance from Sol ascending', () => {
    for (let i = 1; i < worlds.length; i++) {
      expect(worlds[i].dist_pc).toBeGreaterThanOrEqual(worlds[i - 1].dist_pc);
    }
  });

  it('respects min_habitability filter', async () => {
    const filtered = await getHabitableWorlds({ max_dist_pc: 20, min_habitability: 8 });
    for (const w of filtered) {
      expect(w.habitability).toBeGreaterThanOrEqual(8);
    }
  }, TIMEOUT);

  it('centre offset — tiny radius far from Sol returns no results', async () => {
    // Centre 500 pc along x-axis with a 1 pc radius; no Meridian worlds exist there
    const shifted = await getHabitableWorlds({ center_x_pc: 500, max_dist_pc: 1 });
    expect(Array.isArray(shifted)).toBe(true);
    expect(shifted.length).toBe(0);
  }, TIMEOUT);
});

describe('getWorldById()', () => {
  let firstWorld: WorldCandidate;

  beforeAll(async () => {
    const worlds = await getHabitableWorlds(NEARBY);
    firstWorld = worlds[0];
  }, TIMEOUT);

  it('returns the correct world when given a valid body_id + system_id', async () => {
    const result = await getWorldById(firstWorld.body_id, firstWorld.system_id);
    expect(result).not.toBeNull();
    expect(result!.body_id).toBe(firstWorld.body_id);
    expect(result!.system_id).toBe(firstWorld.system_id);
    expect(result!.world_type).toContain('Garden');
    expect(result!.body_position).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('returns null for a non-existent body_id + system_id', async () => {
    const result = await getWorldById('999999999', '999999999');
    expect(result).toBeNull();
  }, TIMEOUT);
});
