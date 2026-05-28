import { Hono } from 'hono';
import { getHabitableWorlds } from '../db/meridian.js';

const worlds = new Hono();

worlds.get('/', async (c) => {
  const q = c.req.query();

  if (!q.max_dist_pc) {
    return c.json({ error: 'max_dist_pc is required' }, 400);
  }

  const max_dist_pc = Number(q.max_dist_pc);
  if (isNaN(max_dist_pc) || max_dist_pc <= 0 || max_dist_pc > 500) {
    return c.json({ error: 'max_dist_pc must be a number between 0 and 500' }, 400);
  }

  const params = {
    max_dist_pc,
    center_x_pc:     q.center_x_pc     ? Number(q.center_x_pc)     : undefined,
    center_y_pc:     q.center_y_pc     ? Number(q.center_y_pc)     : undefined,
    center_z_pc:     q.center_z_pc     ? Number(q.center_z_pc)     : undefined,
    min_habitability: q.min_habitability ? Number(q.min_habitability) : undefined,
    limit:           q.limit           ? Number(q.limit)           : undefined,
    offset:          q.offset          ? Number(q.offset)          : undefined,
  };

  const results = await getHabitableWorlds(params);
  return c.json(results);
});

export default worlds;
