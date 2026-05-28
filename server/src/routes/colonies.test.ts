import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initColonyDb } from '../db/colony.js';
import { getHabitableWorlds } from '../db/meridian.js';
import { buildApp } from '../app.js';
import type { Colony, ColonyTurn, FoundColonyRequest } from '@worldtamer/shared';

const TIMEOUT = 30_000;

let app: ReturnType<typeof buildApp>;
let validRequest: FoundColonyRequest;

// Meridian query is slow — fetch the world once and reuse across all tests
beforeAll(async () => {
  const worlds = await getHabitableWorlds({ max_dist_pc: 20 });
  const world = worlds[0];

  validRequest = {
    body_id:          world.body_id,
    system_id:        world.system_id,
    name:             'Test Colony',
    tech_level:       8,
    home_tl:          8,
    al: 60, il: 20, ml: 15, afl: 5,
    ac: 40, ic_light: 10, ic_heavy: 5, ic_construction: 5, mc: 10,
    power_kw:         500,
    rations:          100,   // = total_laborers → SN = 1.0
    raw_materials_t:  50,
    housing_m3:       10_000, // 100 laborers → SS = 100 m³/laborer (neutral band)
    debt_cr:          0,
  };
}, TIMEOUT);

// Fresh in-memory DB per test — prevents body_id UNIQUE constraint conflicts
beforeEach(() => {
  initColonyDb(':memory:');
  app = buildApp();
});

const post = (body: unknown) =>
  app.request('/api/colonies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// ── POST /api/colonies ────────────────────────────────────────────────────────

describe('POST /api/colonies', () => {
  it('returns 201 and the new colony id', async () => {
    const res = await post(validRequest);
    expect(res.status).toBe(201);
    const body = await res.json() as { id: number };
    expect(typeof body.id).toBe('number');
  });

  it('creates a turn-0 snapshot with correct total_laborers', async () => {
    const res = await post({ ...validRequest, name: 'Laborer Check' });
    const { id } = await res.json() as { id: number };

    const detail = await app.request(`/api/colonies/${id}`);
    const data = await detail.json() as { colony: Colony; turn: ColonyTurn };
    expect(data.turn.month).toBe(0);
    expect(data.turn.total_laborers).toBe(
      validRequest.al + validRequest.il + validRequest.ml + validRequest.afl
    );
  });

  it('turn-0 SN = rations / total_laborers', async () => {
    const res = await post({ ...validRequest, name: 'SN Check' });
    const { id } = await res.json() as { id: number };

    const detail = await app.request(`/api/colonies/${id}`);
    const { turn } = await detail.json() as { colony: Colony; turn: ColonyTurn };
    const expectedSN = validRequest.rations / (validRequest.al + validRequest.il + validRequest.ml + validRequest.afl);
    expect(turn.sn).toBeCloseTo(expectedSN, 4);
  });

  it('turn-0 SS = housing_m3 / total_laborers', async () => {
    const res = await post({ ...validRequest, name: 'SS Check' });
    const { id } = await res.json() as { id: number };

    const detail = await app.request(`/api/colonies/${id}`);
    const { turn } = await detail.json() as { colony: Colony; turn: ColonyTurn };
    const expectedSS = validRequest.housing_m3 / (validRequest.al + validRequest.il + validRequest.ml + validRequest.afl);
    expect(turn.ss).toBeCloseTo(expectedSS, 2);
  });

  it('turn-0 SL = 1.0 (starting goods = home TL baseline)', async () => {
    const res = await post({ ...validRequest, name: 'SL Check' });
    const { id } = await res.json() as { id: number };

    const detail = await app.request(`/api/colonies/${id}`);
    const { turn } = await detail.json() as { colony: Colony; turn: ColonyTurn };
    expect(turn.sl).toBeCloseTo(1.0, 4);
  });

  it('turn-0 political_track = 1 (Level 3 Good)', async () => {
    const res = await post({ ...validRequest, name: 'PT Check' });
    const { id } = await res.json() as { id: number };

    const detail = await app.request(`/api/colonies/${id}`);
    const { turn } = await detail.json() as { colony: Colony; turn: ColonyTurn };
    expect(turn.political_track).toBe(1);
  });

  it('stores computed weather_factor and phi_min on the colony record', async () => {
    const res = await post({ ...validRequest, name: 'Derived Fields Check' });
    const { id } = await res.json() as { id: number };

    const detail = await app.request(`/api/colonies/${id}`);
    const { colony } = await detail.json() as { colony: Colony; turn: ColonyTurn };
    expect(typeof colony.weather_factor).toBe('number');
    expect(colony.phi_min).toBeGreaterThan(0);
    expect(colony.phi_min).toBeLessThanOrEqual(0.90);
  });

  it('returns 409 when a colony already exists on this world', async () => {
    await post({ ...validRequest, name: 'First' });
    const res = await post({ ...validRequest, name: 'Duplicate' });
    expect(res.status).toBe(409);
  });

  it('returns 400 when name is missing', async () => {
    const { name: _, ...noName } = validRequest;
    const res = await post(noName);
    expect(res.status).toBe(400);
  });
});

// ── GET /api/colonies/:id ─────────────────────────────────────────────────────

describe('GET /api/colonies/:id', () => {
  it('returns colony record and current turn snapshot', async () => {
    const created = await post({ ...validRequest, name: 'GET Test' });
    const { id } = await created.json() as { id: number };

    const res = await app.request(`/api/colonies/${id}`);
    expect(res.status).toBe(200);
    const data = await res.json() as { colony: Colony; turn: ColonyTurn };
    expect(data.colony.id).toBe(id);
    expect(data.colony.name).toBe('GET Test');
    expect(data.turn.colony_id).toBe(id);
    expect(data.turn.month).toBe(0);
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await app.request('/api/colonies/999999');
    expect(res.status).toBe(404);
  });
});
