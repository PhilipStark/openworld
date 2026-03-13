import express from 'express';
import cors from 'cors';
import { createDb } from '../src/db.js';
import { generateWorld } from '../src/world.js';
import { createApiRouter } from '../src/api.js';

export function createTestApp() {
  const db = createDb(':memory:');
  generateWorld(db, 20, 20);

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', createApiRouter(db));

  return { app, db, cleanup: () => db.close() };
}
