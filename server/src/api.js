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
    const agent = getAgent(db, req.agent.id);
    if (!agent) return res.status(404).json({ ok: false, error: 'agent_not_found' });
    if (agent.status !== 'awake') {
      return res.status(400).json({ ok: false, error: 'agent_not_awake', message: `Agent is ${agent.status}` });
    }
    const perception = enrichedPerception(db, req.agent.id, 5, currentTick);
    if (!perception) return res.status(404).json({ ok: false, error: 'agent_not_found' });
    res.json(perception);
  });

  router.post('/action', auth, limit, (req, res) => {
    const result = dispatch(db, req.agent.id, req.body, currentTick);
    const status = result.ok ? 200 : 400;
    res.status(status).json(result);
  });

  // Inbox — notifications since last look (attacks, trades, whispers)
  router.get('/inbox', auth, (req, res) => {
    const agent = getAgent(db, req.agent.id);
    if (!agent) return res.status(404).json({ ok: false, error: 'agent_not_found' });

    const since = parseInt(req.query.since) || Math.max(0, currentTick - 20);
    // Get events relevant to this agent
    const events = db.prepare(`
      SELECT tick, type, agent_id, data FROM events
      WHERE tick > ? AND tick <= ?
      AND (
        (type IN ('attack', 'steal_attempt_detected') AND data LIKE ?)
        OR (type = 'whisper' AND data LIKE ?)
        OR (type = 'death' AND agent_id = ?)
      )
      ORDER BY tick DESC LIMIT 50
    `).all(
      since, currentTick,
      `%${req.agent.id}%`, `%${req.agent.id}%`,
      req.agent.id
    );

    const inbox = events.map(e => ({
      tick: e.tick,
      type: e.type,
      from: e.agent_id,
      data: JSON.parse(e.data || '{}'),
    }));

    res.json({ ok: true, inbox, since, tick: currentTick });
  });

  router.get('/status', auth, (req, res) => {
    const agent = getAgent(db, req.agent.id);
    if (!agent) return res.status(404).json({ ok: false, error: 'agent_not_found' });
    if (agent.status === 'dead') {
      return res.json({ status: 'dead', message: 'Agent is dead. Use POST /api/connect to respawn.' });
    }
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

  // Leaderboard — public, no auth required
  router.get('/leaderboard', (req, res) => {
    const agents = db.prepare(`
      SELECT a.id, a.name, a.status, a.hp, a.energy, a.bio, a.created_at,
        (SELECT COUNT(*) FROM items WHERE agent_id = a.id) as item_count,
        (SELECT COALESCE(SUM(qty), 0) FROM items WHERE agent_id = a.id) as total_items,
        (SELECT COUNT(*) FROM events WHERE agent_id = a.id AND type = 'attack') as attacks,
        (SELECT COUNT(*) FROM events WHERE agent_id = a.id AND type = 'death') as deaths,
        (SELECT COUNT(*) FROM structures WHERE owner_id = a.id) as structures_built,
        (SELECT COUNT(*) FROM events WHERE agent_id = a.id AND type = 'speak') as messages_sent
      FROM agents a
      ORDER BY
        CASE a.status WHEN 'awake' THEN 0 WHEN 'exhausted' THEN 1 WHEN 'sleeping' THEN 2 ELSE 3 END,
        a.hp DESC
      LIMIT 50
    `).all();
    res.json({ leaderboard: agents, tick: currentTick });
  });

  return router;
}
