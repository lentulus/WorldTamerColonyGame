import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { initColonyDb } from './db/colony.js';
import { Config } from './config.js';

export function buildApp() {
  initColonyDb(Config.colonyDb);

  const app = new Hono();
  app.use('*', logger());

  app.get('/api/health', (c) => c.json({ ok: true }));

  return app;
}
