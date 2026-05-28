import { serve } from '@hono/node-server';
import { buildApp } from './app.js';
import { initColonyDb } from './db/colony.js';
import { Config } from './config.js';

initColonyDb(Config.colonyDb);
const app = buildApp();

serve({ fetch: app.fetch, port: Config.port }, (info) => {
  console.log(`WorldTamer server running on http://localhost:${info.port}`);
});
