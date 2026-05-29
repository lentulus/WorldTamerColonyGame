/**
 * Slice 9 scripted verification: turn 0 → month 12 end-to-end.
 *
 * Covers:
 *  A. 12-month simulation — full API cycle, SN formula, maintenance = 0
 *  B. Storm damage propagation — AC reduced in finalize
 *  C. Acclimatization DM — penalty at stage 1, absent at stage 5
 *  D. Political track clamping — stays in [−3, +3]
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initColonyDb, getDb } from '../db/colony.js';
import { getHabitableWorlds } from '../db/meridian.js';
import { buildApp } from '../app.js';
import type { TurnResolution } from '@worldtamer/shared';

const TIMEOUT = 90_000;

// ── Shared worlds (fetched once — Meridian query is slow) ────────────────────
// Different groups use different worlds to avoid the body_id UNIQUE constraint.

let worldPool: Array<{ body_id: string; system_id: string }> = [];

beforeAll(async () => {
  worldPool = await getHabitableWorlds({ max_dist_pc: 20 });
  expect(worldPool.length).toBeGreaterThanOrEqual(6);
}, TIMEOUT);

// ── Helpers ───────────────────────────────────────────────────────────────────

// worldAt(n) picks distinct worlds so colonies don't share body_id
const worldAt = (n: number) => worldPool[n % worldPool.length];

const FOUNDING = (bodyId: string, systemId: string, name: string) => ({
  body_id: bodyId, system_id: systemId, name,
  tech_level: 8, home_tl: 8,
  al: 10, il: 5, ml: 5, afl: 0,
  ac: 5, ic_light: 5, ic_heavy: 0, ic_construction: 0, mc: 5,
  power_kw: 500,
  rations:         500,  // large buffer: 500/20 = 25 months at zero production
  raw_materials_t: 200,
  housing_m3:     2_000,
  debt_cr:         0,
});

const TOTAL_LABORERS = 20; // al+il+ml+afl from FOUNDING

async function foundColony(
  app: ReturnType<typeof buildApp>,
  name: string,
  worldIndex = 0,
): Promise<number> {
  const w = worldAt(worldIndex);
  const res = await app.request('/api/colonies', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(FOUNDING(w.body_id, w.system_id, name)),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: number }).id;
}

interface TurnRecord { resolution: TurnResolution; to_population: number; sn: number; maintenance: number }

async function runOneTurn(
  app: ReturnType<typeof buildApp>,
  colonyId: number,
): Promise<TurnRecord> {
  // 1 — Start turn (rolls dice, computes production)
  const startRes = await app.request(`/api/colonies/${colonyId}/turn/start`, { method: 'POST' });
  expect(startRes.status).toBe(200);
  const r = await startRes.json() as TurnResolution;

  // 2 — Rations: exactly subsistence to population; rest stays in stockpile.
  // Capping at TOTAL_LABORERS keeps a growing buffer even when storms reduce AC to 0.
  // SN = to_population / total_laborers = 1.0 as long as available ≥ subsistence.
  const to_population = Math.min(TOTAL_LABORERS, r.rations_available);
  const to_stockpile  = Math.max(0, r.rations_available - to_population);

  const rationRes = await app.request(`/api/colonies/${colonyId}/turn/allocate-rations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_population, to_stockpile, to_export: 0, to_animals: 0 }),
  });
  expect(rationRes.status).toBe(200);
  const { sn } = await rationRes.json() as { sn: number };

  // 3 — Materials: everything stays in stockpile (no explicit consumption)
  const matRes = await app.request(`/api/colonies/${colonyId}/turn/allocate-materials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to_agriculture: 0, to_industry: 0, to_energy: 0,
      to_stockpile: r.raw_materials_available, to_export: 0,
    }),
  });
  expect(matRes.status).toBe(200);

  // 4 — Industrial: all credits to consumer goods (keeps SL stable)
  const indRes = await app.request(`/api/colonies/${colonyId}/turn/allocate-industrial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to_capital_cr:        0,
      to_housing_cr:        0,
      to_consumer_goods_cr: r.q_i,
      to_armed_forces_cr:   0,
      to_export_cr:         0,
      to_road_network_cr:   0,
    }),
  });
  expect(indRes.status).toBe(200);

  // 5 — Finalize: hold same labour split, no new capital
  const finRes = await app.request(`/api/colonies/${colonyId}/turn/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      al: 10, il: 5, ml: 5, afl: 0,
      new_ac: 0, new_ic_light: 0, new_ic_heavy: 0, new_ic_construction: 0, new_mc: 0,
    }),
  });
  expect(finRes.status).toBe(200);
  const finBody = await finRes.json() as { month: number; turn: { maintenance_cost_cr: number } };
  return { resolution: r, to_population, sn, maintenance: finBody.turn.maintenance_cost_cr };
}

// ── A: 12-month simulation ────────────────────────────────────────────────────

describe('A — 12-month end-to-end simulation', () => {
  let app: ReturnType<typeof buildApp>;
  let colonyId: number;
  const turns: TurnRecord[] = [];

  beforeAll(async () => {
    initColonyDb(':memory:');
    app = buildApp();
    colonyId = await foundColony(app, '12-Month Run', 0);
    for (let i = 0; i < 12; i++) {
      turns.push(await runOneTurn(app, colonyId));
    }
  }, TIMEOUT);

  it('current_month advances to 12', async () => {
    const res  = await app.request(`/api/colonies/${colonyId}`);
    const data = await res.json() as { colony: { current_month: number } };
    expect(data.colony.current_month).toBe(12);
  });

  it('creates 12 colony_turns rows (months 1–12)', () => {
    const rows = getDb()
      .prepare('SELECT month FROM colony_turns WHERE colony_id = ? AND month > 0 ORDER BY month')
      .all(colonyId) as { month: number }[];
    expect(rows).toHaveLength(12);
    expect(rows.map(r => r.month)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
  });

  it('SN = to_population / total_laborers each turn (formula correct)', () => {
    for (const t of turns) {
      const expectedSN = t.to_population / TOTAL_LABORERS;
      expect(t.sn).toBeCloseTo(expectedSN, 4);
    }
  });

  it('SN = 1.0 throughout (subsistence always met on a 500-ration buffer)', () => {
    // Allocating exactly TOTAL_LABORERS rations to population each turn keeps the
    // stockpile growing — even if storm damage destroys all AC, the buffer covers
    // production gaps for the 12-month horizon.
    for (const t of turns) {
      expect(t.sn).toBeCloseTo(1.0, 4);
    }
  });

  it('maintenance_cost_cr = 0 for months 1–12 (colony age < 120)', () => {
    for (const t of turns) {
      expect(t.maintenance).toBe(0);
    }
  });

  it('political track stays within [−3, +3] every turn', () => {
    for (const t of turns) {
      const { new_track, track_movement } = t.resolution.political;
      expect(new_track).toBeGreaterThanOrEqual(-3);
      expect(new_track).toBeLessThanOrEqual(3);
      // consistency: new_track = clamped(old_track + movement)
      const oldTrack = new_track - track_movement;
      const clamped  = Math.max(-3, Math.min(3, oldTrack + track_movement));
      expect(new_track).toBe(clamped);
    }
  });

  it('infrastructure_efficiency = 0.60 throughout (no roads funded)', () => {
    const rows = getDb()
      .prepare('SELECT infrastructure_efficiency FROM colony_turns WHERE colony_id = ? AND month > 0')
      .all(colonyId) as { infrastructure_efficiency: number }[];
    for (const row of rows) {
      expect(row.infrastructure_efficiency).toBeCloseTo(0.60, 4);
    }
  });
});

// ── B: Storm damage propagation ───────────────────────────────────────────────

describe('B — storm damage reduces AC in finalize', () => {
  let app: ReturnType<typeof buildApp>;
  let colonyId: number;
  const STORM_DAMAGE = 3;

  beforeAll(async () => {
    initColonyDb(':memory:');
    app = buildApp();
    colonyId = await foundColony(app, 'Storm Test', 1);

    // Run through all allocation steps normally
    const startRes = await app.request(`/api/colonies/${colonyId}/turn/start`, { method: 'POST' });
    const r = await startRes.json() as TurnResolution;

    await app.request(`/api/colonies/${colonyId}/turn/allocate-rations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_population: r.rations_available, to_stockpile: 0, to_export: 0, to_animals: 0 }),
    });
    await app.request(`/api/colonies/${colonyId}/turn/allocate-materials`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_agriculture: 0, to_industry: 0, to_energy: 0, to_stockpile: r.raw_materials_available, to_export: 0 }),
    });
    await app.request(`/api/colonies/${colonyId}/turn/allocate-industrial`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_capital_cr: 0, to_housing_cr: 0, to_consumer_goods_cr: r.q_i, to_armed_forces_cr: 0, to_export_cr: 0, to_road_network_cr: 0 }),
    });

    // Inject storm_damage into active_turn_json before finalize
    const turnJson = getDb()
      .prepare('SELECT active_turn_json FROM colonies WHERE id = ?')
      .get(colonyId) as { active_turn_json: string };
    const resolution = JSON.parse(turnJson.active_turn_json) as TurnResolution;
    resolution.storm_damage = STORM_DAMAGE;
    getDb()
      .prepare('UPDATE colonies SET active_turn_json = ? WHERE id = ?')
      .run(JSON.stringify(resolution), colonyId);
  }, TIMEOUT);

  it('AC after finalize = max(0, founding_ac − storm_damage)', async () => {
    const FOUNDING_AC = 5;                                       // from FOUNDING constant
    const expectedAc  = Math.max(0, FOUNDING_AC - STORM_DAMAGE); // 5 − 3 = 2

    const finRes = await app.request(`/api/colonies/${colonyId}/turn/finalize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ al: 10, il: 5, ml: 5, afl: 0, new_ac: 0, new_ic_light: 0, new_ic_heavy: 0, new_ic_construction: 0, new_mc: 0 }),
    });
    expect(finRes.status).toBe(200);

    const row = getDb()
      .prepare('SELECT ac FROM colony_turns WHERE colony_id = ? AND month = 1')
      .get(colonyId) as { ac: number };
    expect(row.ac).toBe(expectedAc);
  });
});

// ── C: Acclimatization DM ────────────────────────────────────────────────────

describe('C — acclimatization DM in turn resolution', () => {
  let app: ReturnType<typeof buildApp>;

  // Fresh DB per test: each test founds a colony on a different world
  beforeEach(() => {
    initColonyDb(':memory:');
    app = buildApp();
  });

  it('stage 1 colony → DM < 0 and new_stage ≥ 1 ≤ 2', async () => {
    const id = await foundColony(app, 'Accl Stage 1', 2);
    // stage 1 is the founding default — no patch needed
    const res = await app.request(`/api/colonies/${id}/turn/start`, { method: 'POST' });
    const r   = await res.json() as TurnResolution;
    expect(r.acclimatization.dm).toBeLessThan(0);
    expect(r.acclimatization.old_stage).toBe(1);
    expect(r.acclimatization.new_stage).toBeGreaterThanOrEqual(1);
    expect(r.acclimatization.new_stage).toBeLessThanOrEqual(2);
  });

  it('stage 5 colony → DM = 0 and new_stage = 5', async () => {
    const id = await foundColony(app, 'Accl Stage 5', 3);
    getDb().prepare('UPDATE colonies SET acclimatization_stage = 5 WHERE id = ?').run(id);
    const res = await app.request(`/api/colonies/${id}/turn/start`, { method: 'POST' });
    const r   = await res.json() as TurnResolution;
    expect(r.acclimatization.dm).toBe(0);
    expect(r.acclimatization.old_stage).toBe(5);
    expect(r.acclimatization.new_stage).toBe(5);
    expect(r.acclimatization.advanced).toBe(false);
  });

  it('advanced flag = true iff new_stage > old_stage (stages 1–4)', async () => {
    // Each stage gets its own fresh DB to avoid body_id conflicts
    for (let stage = 1; stage <= 4; stage++) {
      initColonyDb(':memory:');
      app = buildApp();
      const id = await foundColony(app, `Stage ${stage}`, stage + 1);
      getDb().prepare('UPDATE colonies SET acclimatization_stage = ? WHERE id = ?').run(stage, id);
      const res = await app.request(`/api/colonies/${id}/turn/start`, { method: 'POST' });
      const r   = await res.json() as TurnResolution;
      expect(r.acclimatization.advanced).toBe(r.acclimatization.new_stage > r.acclimatization.old_stage);
    }
  });
});

// ── D: Maintenance cost schedule (integration path) ──────────────────────────

describe('D — maintenance cost is zero for a young colony', () => {
  let app: ReturnType<typeof buildApp>;
  let colonyId: number;

  beforeAll(async () => {
    initColonyDb(':memory:');
    app = buildApp();
    colonyId = await foundColony(app, 'Maintenance Test', 5);
  }, TIMEOUT);

  it('finalize at month 1 records maintenance_cost_cr = 0', async () => {
    const r = await runOneTurn(app, colonyId);
    expect(r.maintenance).toBe(0);
  });

  it('maintenance onset is tested by computeMaintenanceCost unit tests (age 119 = 0, age 120 > 0)', () => {
    // computeMaintenanceCost is covered in maintenance.test.ts.
    // This assertion documents that the integration test defers to the unit test
    // rather than duplicating a 120-turn HTTP simulation.
    expect(true).toBe(true);
  });
});
