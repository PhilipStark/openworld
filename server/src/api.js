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

  // === MEMORY: Agent Notes ===
  router.get('/notes', auth, (req, res) => {
    const notes = db.prepare("SELECT key, value, updated_at FROM agent_notes WHERE agent_id = ? ORDER BY updated_at DESC LIMIT 100").all(req.agent.id);
    res.json({ ok: true, notes });
  });

  router.post('/notes', auth, (req, res) => {
    const { key, value } = req.body || {};
    if (!key || typeof key !== 'string' || key.length > 100) {
      return res.status(400).json({ ok: false, error: 'invalid_key', message: 'Key must be 1-100 chars' });
    }
    if (value === undefined || value === null || String(value).length > 2000) {
      return res.status(400).json({ ok: false, error: 'invalid_value', message: 'Value must be ≤2000 chars' });
    }
    // Max 50 notes per agent
    const count = db.prepare("SELECT COUNT(*) as cnt FROM agent_notes WHERE agent_id = ?").get(req.agent.id).cnt;
    const existing = db.prepare("SELECT id FROM agent_notes WHERE agent_id = ? AND key = ?").get(req.agent.id, key);
    if (count >= 50 && !existing) {
      return res.status(400).json({ ok: false, error: 'too_many_notes', message: 'Max 50 notes. Delete some first.' });
    }
    db.prepare(`
      INSERT INTO agent_notes (agent_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(agent_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(req.agent.id, key, String(value));
    res.json({ ok: true, saved: { key, value: String(value) } });
  });

  router.delete('/notes/:key', auth, (req, res) => {
    const result = db.prepare("DELETE FROM agent_notes WHERE agent_id = ? AND key = ?").run(req.agent.id, req.params.key);
    res.json({ ok: true, deleted: result.changes > 0 });
  });

  // === RELATIONSHIPS ===
  router.get('/relationships', auth, (req, res) => {
    const rels = db.prepare(`
      SELECT r.target_id, a.name as target_name, r.stance, r.note, r.updated_at
      FROM relationships r JOIN agents a ON a.id = r.target_id
      WHERE r.agent_id = ? ORDER BY r.updated_at DESC
    `).all(req.agent.id);
    res.json({ ok: true, relationships: rels });
  });

  router.post('/relationships', auth, (req, res) => {
    const { agent_id: targetId, stance, note } = req.body || {};
    if (!targetId) return res.status(400).json({ ok: false, error: 'invalid_params', message: 'Need agent_id' });
    const validStances = ['ally', 'friendly', 'neutral', 'suspicious', 'hostile'];
    if (stance && !validStances.includes(stance)) {
      return res.status(400).json({ ok: false, error: 'invalid_stance', message: `Stance must be one of: ${validStances.join(', ')}` });
    }
    const target = db.prepare("SELECT id, name FROM agents WHERE id = ? OR name = ?").get(targetId, targetId);
    if (!target) return res.status(404).json({ ok: false, error: 'target_not_found' });
    if (target.id === req.agent.id) return res.status(400).json({ ok: false, error: 'self_target' });

    db.prepare(`
      INSERT INTO relationships (agent_id, target_id, stance, note, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(agent_id, target_id) DO UPDATE SET
        stance = COALESCE(excluded.stance, stance),
        note = COALESCE(excluded.note, note),
        updated_at = datetime('now')
    `).run(req.agent.id, target.id, stance || 'neutral', (note || '').slice(0, 280));
    res.json({ ok: true, relationship: { target_id: target.id, target_name: target.name, stance: stance || 'neutral' } });
  });

  // === ALLIANCES ===
  router.get('/alliances', (req, res) => {
    const alliances = db.prepare(`
      SELECT a.id, a.name, a.description, a.leader_id, ag.name as leader_name,
        (SELECT COUNT(*) FROM alliance_members WHERE alliance_id = a.id) as member_count
      FROM alliances a JOIN agents ag ON ag.id = a.leader_id
      ORDER BY member_count DESC
    `).all();
    res.json({ ok: true, alliances });
  });

  router.get('/alliances/:id', (req, res) => {
    const alliance = db.prepare("SELECT * FROM alliances WHERE id = ? OR name = ?").get(req.params.id, req.params.id);
    if (!alliance) return res.status(404).json({ ok: false, error: 'not_found' });
    const members = db.prepare(`
      SELECT am.agent_id, a.name, am.role, am.joined_at
      FROM alliance_members am JOIN agents a ON a.id = am.agent_id
      WHERE am.alliance_id = ?
    `).all(alliance.id);
    res.json({ ok: true, alliance, members });
  });

  router.post('/alliances', auth, (req, res) => {
    const { name, description } = req.body || {};
    if (!name || name.length < 2 || name.length > 30) {
      return res.status(400).json({ ok: false, error: 'invalid_name', message: 'Name must be 2-30 chars' });
    }
    // Check agent isn't already in an alliance
    const existing = db.prepare("SELECT alliance_id FROM alliance_members WHERE agent_id = ?").get(req.agent.id);
    if (existing) return res.status(400).json({ ok: false, error: 'already_in_alliance', message: 'Leave current alliance first' });

    const id = Math.random().toString(36).slice(2, 10);
    try {
      db.prepare("INSERT INTO alliances (id, name, leader_id, description) VALUES (?, ?, ?, ?)").run(id, name, req.agent.id, (description || '').slice(0, 280));
      db.prepare("INSERT INTO alliance_members (alliance_id, agent_id, role) VALUES (?, ?, 'leader')").run(id, req.agent.id);
      res.status(201).json({ ok: true, alliance: { id, name } });
    } catch (e) {
      res.status(400).json({ ok: false, error: 'name_taken', message: 'Alliance name already exists' });
    }
  });

  router.post('/alliances/:id/join', auth, (req, res) => {
    const alliance = db.prepare("SELECT * FROM alliances WHERE id = ? OR name = ?").get(req.params.id, req.params.id);
    if (!alliance) return res.status(404).json({ ok: false, error: 'not_found' });
    const existing = db.prepare("SELECT alliance_id FROM alliance_members WHERE agent_id = ?").get(req.agent.id);
    if (existing) return res.status(400).json({ ok: false, error: 'already_in_alliance' });
    db.prepare("INSERT INTO alliance_members (alliance_id, agent_id, role) VALUES (?, ?, 'member')").run(alliance.id, req.agent.id);
    res.json({ ok: true, joined: alliance.name });
  });

  router.post('/alliances/:id/leave', auth, (req, res) => {
    const alliance = db.prepare("SELECT * FROM alliances WHERE id = ? OR name = ?").get(req.params.id, req.params.id);
    if (!alliance) return res.status(404).json({ ok: false, error: 'not_found' });
    if (alliance.leader_id === req.agent.id) {
      // Leader leaving = disband
      db.prepare("DELETE FROM alliance_members WHERE alliance_id = ?").run(alliance.id);
      db.prepare("DELETE FROM alliances WHERE id = ?").run(alliance.id);
      return res.json({ ok: true, disbanded: true });
    }
    db.prepare("DELETE FROM alliance_members WHERE alliance_id = ? AND agent_id = ?").run(alliance.id, req.agent.id);
    res.json({ ok: true, left: alliance.name });
  });

  // === AGENT PROFILES (public) ===
  router.get('/agents/:id', (req, res) => {
    const agent = db.prepare("SELECT id, name, status, hp, energy, bio, created_at FROM agents WHERE id = ? OR name = ?").get(req.params.id, req.params.id);
    if (!agent) return res.status(404).json({ ok: false, error: 'not_found' });
    const alliance = db.prepare(`
      SELECT a.id, a.name, am.role FROM alliance_members am
      JOIN alliances a ON a.id = am.alliance_id
      WHERE am.agent_id = ?
    `).get(agent.id);
    const structures = db.prepare("SELECT COUNT(*) as cnt FROM structures WHERE owner_id = ?").get(agent.id).cnt;
    res.json({ ok: true, agent: { ...agent, alliance: alliance || null, structures_built: structures } });
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
