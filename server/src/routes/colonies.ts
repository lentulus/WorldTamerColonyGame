import { Hono } from 'hono';
import { getWorldById } from '../db/meridian.js';
import { createColony, getColony, ColonyConflictError } from '../db/colonies.js';
import { getDb } from '../db/colony.js';
import { computeWeatherFactor, computePhiMin } from '../engine/founding.js';
import type { FoundColonyRequest } from '@worldtamer/shared';

const colonies = new Hono();

// ── POST /api/colonies ────────────────────────────────────────────────────────

colonies.post('/', async (c) => {
  let req: FoundColonyRequest;
  try {
    req = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  if (!req.name?.trim())     return c.json({ error: 'name is required' }, 400);
  if (!req.body_id)          return c.json({ error: 'body_id is required' }, 400);
  if (!req.system_id)        return c.json({ error: 'system_id is required' }, 400);
  if (req.tech_level == null) return c.json({ error: 'tech_level is required' }, 400);
  if (req.home_tl    == null) return c.json({ error: 'home_tl is required' }, 400);

  const world = await getWorldById(req.body_id, req.system_id);
  if (!world) return c.json({ error: 'World not found in Meridian' }, 404);

  const weatherFactor = computeWeatherFactor(
    world.star_spectral, world.axial_tilt_deg, world.hydrographics_code
  );
  const phiMin = computePhiMin(world.axial_tilt_deg, world.tidally_locked);

  try {
    const id = createColony(req, world, weatherFactor, phiMin);
    return c.json({ id }, 201);
  } catch (err) {
    if (err instanceof ColonyConflictError) return c.json({ error: err.message }, 409);
    throw err;
  }
});

// ── GET /api/colonies/:id ─────────────────────────────────────────────────────

colonies.get('/:id', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'invalid id' }, 400);

  const data = getColony(id);
  if (!data) return c.json({ error: 'Colony not found' }, 404);

  // Include last 5 completed turns for history display (month > 0)
  const recentRows = getDb().prepare(`
    SELECT month, sn, ss, sl, political_track
    FROM colony_turns
    WHERE colony_id = ? AND month > 0
    ORDER BY month DESC LIMIT 5
  `).all(id) as Array<{ month: number; sn: number; ss: number; sl: number; political_track: number }>;

  // Active ongoing events (duration effects still running)
  const currentMonth = data.colony.current_month;
  const activeEvents = getDb().prepare(`
    SELECT event_type, description, active_until_month
    FROM colony_events
    WHERE colony_id = ? AND active_until_month IS NOT NULL AND active_until_month >= ?
    ORDER BY active_until_month ASC
  `).all(id, currentMonth) as Array<{ event_type: string; description: string; active_until_month: number }>;

  return c.json({ ...data, recent_turns: recentRows, active_events: activeEvents });
});

export default colonies;
