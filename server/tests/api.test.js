import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers.js';

describe('API', () => {
  let app, db, cleanup;

  beforeEach(() => {
    const test = createTestApp();
    app = test.app;
    db = test.db;
    cleanup = test.cleanup;
  });
  afterEach(() => cleanup());

  it('POST /api/register creates agent', async () => {
    const res = await request(app).post('/api/register').send({ name: 'TestBot' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.name).toBe('TestBot');
  });

  it('POST /api/connect spawns agent', async () => {
    const reg = await request(app).post('/api/register').send({ name: 'TestBot' });
    const res = await request(app).post('/api/connect')
      .set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/look returns perception', async () => {
    const reg = await request(app).post('/api/register').send({ name: 'TestBot' });
    await request(app).post('/api/connect').set('Authorization', `Bearer ${reg.body.token}`);
    const res = await request(app).get('/api/look').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.position).toBeDefined();
    expect(res.body.hp).toBeDefined();
  });

  it('POST /api/action processes action', async () => {
    const reg = await request(app).post('/api/register').send({ name: 'TestBot' });
    await request(app).post('/api/connect').set('Authorization', `Bearer ${reg.body.token}`);
    const res = await request(app).post('/api/action')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ action: 'look', params: {}, thinking: 'checking surroundings' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/look');
    expect(res.status).toBe(401);
  });

  it('GET /api/world/stats returns world info', async () => {
    const res = await request(app).get('/api/world/stats');
    expect(res.status).toBe(200);
    expect(res.body.width).toBeDefined();
    expect(res.body.agent_count).toBeDefined();
  });
});
