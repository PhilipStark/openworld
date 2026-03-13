import { Router } from 'express';
import { registerAgent, connectAgent, disconnectAgent, buildPerception, getAgent } from './agent.js';
import { dispatch } from './actions.js';
import { getWorldSize } from './world.js';
import { authMiddleware, rateLimiter, ipRateLimiter } from './auth.js';
import { getMessagesForAgent } from './chat.js';
import { getTradesForAgent } from './economy.js';

function enrichedPerception(db, agentId, radius, tick) {
  const perception = buildPerception(db, agentId, radius, tick);
  if (!perception) return null;
  const agent = getAgent(db, agentId);
  perception.messages = getMessagesForAgent(db, agentId, agent.x, agent.y, Math.max(0, tick - 10), tick);
  perception.pending_trades = getTradesForAgent(db, agentId);
  return perception;
}

let currentTick = 0;
export function setTick(t) { currentTick = t; }
export function getTick() { return currentTick; }

export function createApiRouter(db) {
  const router = Router();
  const auth = authMiddleware(db);
  const limit = rateLimiter();
  const registerLimit = ipRateLimiter({ windowMs: 60000, maxRequests: 5 });

  const MAX_AGENTS = parseInt(process.env.MAX_AGENTS) || 1000;

  router.post('/register', registerLimit, (req, res) => {
    try {
      const { name } = req.body;
      if (!name || name.length < 1 || name.length > 50) {
        return res.status(400).json({ ok: false, error: 'invalid_name', message: 'Name must be 1-50 chars' });
      }
      const agentCount = db.prepare("SELECT COUNT(*) as cnt FROM agents").get().cnt;
      if (agentCount >= MAX_AGENTS) {
        return res.status(503).json({ ok: false, error: 'world_full', message: 'World has reached max agent capacity' });
      }
      const result = registerAgent(db, name);
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ ok: false, error: 'registration_failed', message: e.message });
    }
  });

  router.post('/connect', auth, (req, res) => {
    try {
      connectAgent(db, req.agent.id);
      res.json({ ok: true, message: 'Agent connected and spawned' });
    } catch (e) {
      res.status(400).json({ ok: false, error: 'connect_failed', message: e.message });
    }
  });

  router.post('/disconnect', auth, (req, res) => {
    disconnectAgent(db, req.agent.id);
    res.json({ ok: true, message: 'Agent disconnected (sleeping)' });
  });

  router.get('/look', auth, (req, res) => {
    const perception = enrichedPerception(db, req.agent.id, 5, currentTick);
    if (!perception) return res.status(404).json({ ok: false, error: 'agent_not_found' });
    res.json(perception);
  });

  router.post('/action', auth, limit, (req, res) => {
    const result = dispatch(db, req.agent.id, req.body, currentTick);
    const status = result.ok ? 200 : 400;
    res.status(status).json(result);
  });

  router.get('/status', auth, (req, res) => {
    const perception = enrichedPerception(db, req.agent.id, 0, currentTick);
    res.json(perception);
  });

  router.get('/world/stats', (req, res) => {
    const size = getWorldSize(db);
    const agentCount = db.prepare("SELECT COUNT(*) as cnt FROM agents").get().cnt;
    const awakeCount = db.prepare("SELECT COUNT(*) as cnt FROM agents WHERE status = 'awake'").get().cnt;
    res.json({ ...size, agent_count: agentCount, awake_count: awakeCount, tick: currentTick });
  });

  router.get('/events', (req, res) => {
    const from = parseInt(req.query.from) || 0;
    const to = parseInt(req.query.to) || currentTick;
    const events = db.prepare(
      "SELECT * FROM events WHERE tick > ? AND tick <= ? ORDER BY tick ASC LIMIT 1000"
    ).all(from, to);
    res.json({ events: events.map(e => ({ ...e, data: JSON.parse(e.data || '{}') })) });
  });

  return router;
}
