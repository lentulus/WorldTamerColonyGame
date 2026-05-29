import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { initColonyDb } from '../db/colony.js';
import { getHabitableWorlds } from '../db/meridian.js';
import { buildApp } from '../app.js';
import { setPolicyPath } from './suggest.js';
import { CHROMOSOME_LEN } from '../../../training/src/policy.js';
import type { Colony, ColonyTurn, FoundColonyRequest } from '@worldtamer/shared';

const TIMEOUT = 30_000;

// ── Policy file fixtures ──────────────────────────────────────────────────────

const TEMP_POLICY_PATH = join(process.cwd(), '_test_policy.json');
const MISSING_POLICY_PATH = '/nonexistent/path/best_policy.json';

// Zero chromosome → uniform allocations
const ZERO_POLICY = JSON.stringify({
  chromosome: new Array(CHROMOSOME_LEN).fill(0),
  score: 0, generation: 0, timestamp: new Date().toISOString(),
  config: { POP_SIZE: 20, GENERATIONS: 10, H: 4, K_TRAIN: 2 },
});

// ── Shared world ──────────────────────────────────────────────────────────────

let validRequest: FoundColonyRequest;

beforeAll(async () => {
  const worlds = await getHabitableWorlds({ max_dist_pc: 20 });
  const w = worlds[0];
  validRequest = {
    body_id: w.body_id, system_id: w.system_id,
    name: 'Suggest Test Colony', tech_level: 8, home_tl: 8,
    al: 60, il: 20, ml: 15, afl: 5,
    ac: 40, ic_light: 10, ic_heavy: 5, ic_construction: 5, mc: 10,
    power_kw: 500, rations: 100, raw_materials_t: 200,
    housing_m3: 10_000, debt_cr: 0,
  };
  writeFileSync(TEMP_POLICY_PATH, ZERO_POLICY);
}, TIMEOUT);

afterAll(() => {
  if (existsSync(TEMP_POLICY_PATH)) unlinkSync(TEMP_POLICY_PATH);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  initColonyDb(':memory:');
  app = buildApp();
});

async function foundColony(): Promise<number> {
  const res = await app.request('/api/colonies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validRequest),
  });
  return ((await res.json()) as { id: number }).id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/colonies/:id/suggest', () => {
  it('returns 404 for a non-existent colony', async () => {
    setPolicyPath(TEMP_POLICY_PATH);
    const res = await app.request('/api/colonies/999999/suggest');
    expect(res.status).toBe(404);
  });

  it('returns 503 when no trained policy file exists', async () => {
    setPolicyPath(MISSING_POLICY_PATH);
    const id = await foundColony();
    const res = await app.request(`/api/colonies/${id}/suggest`);
    expect(res.status).toBe(503);
  });

  it('returns 200 with correct top-level keys', async () => {
    setPolicyPath(TEMP_POLICY_PATH);
    const id  = await foundColony();
    const res = await app.request(`/api/colonies/${id}/suggest`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('rations');
    expect(body).toHaveProperty('materials');
    expect(body).toHaveProperty('industrial');
    expect(body).toHaveProperty('labour');
  });

  it('rations suggestion has correct keys', async () => {
    setPolicyPath(TEMP_POLICY_PATH);
    const id  = await foundColony();
    const res = await app.request(`/api/colonies/${id}/suggest`);
    const { rations } = await res.json() as { rations: Record<string, number> };
    expect(rations).toHaveProperty('to_population_frac');
    expect(rations).toHaveProperty('to_export_frac');
  });

  it('all suggested fractions are numbers in [0, 1]', async () => {
    setPolicyPath(TEMP_POLICY_PATH);
    const id  = await foundColony();
    const res = await app.request(`/api/colonies/${id}/suggest`);
    const body = await res.json() as {
      rations:    Record<string, number>;
      materials:  Record<string, number>;
      industrial: Record<string, number>;
      labour:     Record<string, number>;
    };
    const allValues = [
      ...Object.values(body.rations),
      ...Object.values(body.materials),
      ...Object.values(body.industrial),
      ...Object.values(body.labour),
    ];
    for (const v of allValues) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('zero chromosome → near-uniform rations suggestion (1/3 each)', async () => {
    setPolicyPath(TEMP_POLICY_PATH);
    const id  = await foundColony();
    const res = await app.request(`/api/colonies/${id}/suggest`);
    const { rations } = await res.json() as { rations: { to_population_frac: number; to_export_frac: number } };
    // Zero chromosome → softmax([0,0,0]) → [1/3, 1/3, 1/3]
    // After subsistence floor: pop_frac raised if needed, but with 100 rations and 100 laborers
    // minPopFrac = min(1, 100/100) = 1.0 → pop gets everything
    // So to_population_frac should be 1.0 after floor
    expect(rations.to_population_frac).toBeGreaterThan(0);
    expect(rations.to_population_frac).toBeLessThanOrEqual(1);
  });

  it('labour fracs sum to ≤ 1.0', async () => {
    setPolicyPath(TEMP_POLICY_PATH);
    const id  = await foundColony();
    const res = await app.request(`/api/colonies/${id}/suggest`);
    const { labour } = await res.json() as { labour: Record<string, number> };
    const sum = Object.values(labour).reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(1.0 + 1e-9);
  });
});
