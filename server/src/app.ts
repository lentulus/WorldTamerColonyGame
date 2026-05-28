import { Hono } from 'hono';
import { logger } from 'hono/logger';
import worlds from './routes/worlds.js';
import colonies from './routes/colonies.js';

// DB must be initialised before calling buildApp().
// main.ts calls initColonyDb(Config.colonyDb); tests call initColonyDb(':memory:').
export function buildApp() {
  const app = new Hono();
  app.use('*', logger());

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api/worlds', worlds);
  app.route('/api/colonies', colonies);

  return app;
}
