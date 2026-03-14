import { v4 as uuid } from 'uuid';

const DAY_LENGTH = 2400;

export function registerAgent(db, name) {
  const id = uuid().slice(0, 8);
  const token = uuid();
  try {
    db.prepare(
      'INSERT INTO agents (id, name, token) VALUES (?, ?, ?)'
    ).run(id, name, token);
  } catch (e) {
    if (e.message.includes('UNIQUE')) throw new Error(`Name "${name}" already taken`);
    throw e;
  }
  return { id, name, token };
}

export function connectAgent(db, id) {
  const agent = getAgent(db, id);
  if (!agent) throw new Error('Agent not found');

  // Spawn near town center (within 8 tiles) on passable ground
  // This creates natural social interaction from the start
  const { width, height } = db.prepare('SELECT MAX(x) + 1 as width, MAX(y) + 1 as height FROM tiles').get();
  const centerX = Math.floor((width || 50) / 2);
  const centerY = Math.floor((height || 50) / 2);

  const candidates = db.prepare(
    "SELECT x, y FROM tiles WHERE type NOT IN ('water', 'mountain') AND ABS(x - ?) + ABS(y - ?) <= 8 ORDER BY RANDOM() LIMIT 10"
  ).all(centerX, centerY);

  // Fallback: anywhere passable if no town tiles available
  if (candidates.length === 0) {
    const fallback = db.prepare(
      "SELECT x, y FROM tiles WHERE type NOT IN ('water', 'mountain') ORDER BY RANDOM() LIMIT 5"
    ).all();
    candidates.push(...fallback);
  }

  const otherAgents = db.prepare(
    "SELECT x, y FROM agents WHERE status IN ('awake', 'exhausted') AND id != ?"
  ).all(id);

  // Pick tile with most space from other agents (but still near center)
  let tile = candidates[0];
  if (otherAgents.length > 0 && candidates.length > 1) {
    let bestDist = -1;
    for (const c of candidates) {
      let minDist = Infinity;
      for (const a of otherAgents) {
        const d = Math.abs(c.x - a.x) + Math.abs(c.y - a.y);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestDist) {
        bestDist = minDist;
        tile = c;
      }
    }
  }

  if (!tile) throw new Error('No passable tile found');

  const isRespawn = agent.status === 'dead';
  db.prepare(`
    UPDATE agents SET status = 'awake', x = ?, y = ?, hp = 100, energy = 100,
    busy_action = NULL, busy_ticks_remaining = 0,
    last_seen = datetime('now')
    ${isRespawn ? ", weapon = NULL, shield = NULL, tool = NULL" : ""}
    WHERE id = ?
  `).run(tile.x, tile.y, id);

  if (isRespawn) {
    db.prepare('DELETE FROM items WHERE agent_id = ?').run(id);
  }
}

export function disconnectAgent(db, id) {
  db.prepare("UPDATE agents SET status = 'sleeping', busy_action = NULL, busy_ticks_remaining = 0 WHERE id = ?").run(id);
}

export function getAgent(db, id) {
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) || null;
}

export function getAgentByToken(db, token) {
  return db.prepare('SELECT * FROM agents WHERE token = ?').get(token) || null;
}

export function getInventory(db, agentId) {
  return db.prepare('SELECT item, qty FROM items WHERE agent_id = ?').all(agentId);
}

export function getAwakeAgents(db) {
  return db.prepare("SELECT * FROM agents WHERE status = 'awake'").all();
}

export function buildPerception(db, agentId, radius, tick) {
  const agent = getAgent(db, agentId);
  if (!agent) return null;

  const inventory = getInventory(db, agentId);

  const nearbyAgents = db.prepare(`
    SELECT a.id, a.name, a.x, a.y, a.status, a.hp, a.bio,
      r.stance as relationship
    FROM agents a
    LEFT JOIN relationships r ON r.agent_id = ? AND r.target_id = a.id
    WHERE a.id != ? AND ABS(a.x - ?) + ABS(a.y - ?) <= ? AND a.status != 'dead'
  `).all(agentId, agentId, agent.x, agent.y, radius);

  const nearbyResources = db.prepare(`
    SELECT x, y, type, resource, resource_qty FROM tiles
    WHERE resource IS NOT NULL AND resource_qty > 0
    AND ABS(x - ?) + ABS(y - ?) <= ?
  `).all(agent.x, agent.y, radius);

  const nearbyStructures = db.prepare(`
    SELECT x, y, type, owner_id, text FROM structures
    WHERE ABS(x - ?) + ABS(y - ?) <= ?
  `).all(agent.x, agent.y, radius);

  // Alliance info
  const alliance = db.prepare(`
    SELECT a.id, a.name, am.role FROM alliance_members am
    JOIN alliances a ON a.id = am.alliance_id
    WHERE am.agent_id = ?
  `).get(agentId);

  const dayLength = 2400;
  const day = Math.floor(tick / dayLength) + 1;
  const dayProgress = (tick % dayLength) / dayLength;
  const phase = dayProgress < 0.25 ? 'morning' : dayProgress < 0.5 ? 'afternoon' : dayProgress < 0.75 ? 'evening' : 'night';

  // Hunger: ticks until next auto-eat (day boundary)
  const ticksUntilHunger = DAY_LENGTH - (tick % DAY_LENGTH);
  const hasFood = inventory.some(i => ['berries', 'fish', 'bread'].includes(i.item));

  return {
    position: { x: agent.x, y: agent.y },
    hp: agent.hp,
    energy: agent.energy,
    hunger: { ticks_until_eat: ticksUntilHunger, has_food: hasFood },
    inventory,
    equipment: { weapon: agent.weapon, shield: agent.shield, tool: agent.tool },
    busy: agent.busy_action ? { action: agent.busy_action, ticks_remaining: agent.busy_ticks_remaining } : null,
    alliance: alliance ? { id: alliance.id, name: alliance.name, role: alliance.role } : null,
    nearby_agents: nearbyAgents.map(a => ({ id: a.id, name: a.name, x: a.x, y: a.y, status: a.status, hp: a.hp, bio: a.bio, relationship: a.relationship || null })),
    nearby_resources: nearbyResources.map(r => ({ tile: [r.x, r.y], type: r.resource, qty: r.resource_qty })),
    nearby_structures: nearbyStructures.map(s => ({ tile: [s.x, s.y], type: s.type, text: s.text, owner: s.owner_id })),
    messages: [],
    pending_trades: [],
    world_time: { day, phase },
    tick,
  };
}
