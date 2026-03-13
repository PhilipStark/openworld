import { getAwakeAgents, getAgent } from './agent.js';
import { getWorldSize } from './world.js';
import { getPublicChatSince } from './chat.js';

export function setupWebSocket(io, db) {
  let viewerCount = 0;

  io.on('connection', (socket) => {
    viewerCount++;
    io.emit('viewers', viewerCount);

    const tiles = db.prepare("SELECT x, y, type FROM tiles").all();
    const { width, height } = getWorldSize(db);
    socket.emit('tiles', { tiles, width, height });

    socket.on('disconnect', () => {
      viewerCount--;
      io.emit('viewers', viewerCount);
    });

    socket.on('follow', (agentId) => {
      socket.join(`agent:${agentId}`);
    });

    socket.on('unfollow', (agentId) => {
      socket.leave(`agent:${agentId}`);
    });
  });

  return { getViewerCount: () => viewerCount };
}

export function broadcastTick(io, db, tick) {
  const agents = db.prepare(
    "SELECT id, name, x, y, hp, energy, status, bio, weapon, shield, tool, busy_action, busy_ticks_remaining FROM agents WHERE status != 'dead'"
  ).all();

  for (const agent of agents) {
    agent.inventory = db.prepare("SELECT item, qty FROM items WHERE agent_id = ?").all(agent.id);
  }

  const { width, height } = getWorldSize(db);

  const events = db.prepare(
    "SELECT * FROM events WHERE tick = ? ORDER BY id ASC"
  ).all(tick);

  const structures = db.prepare(
    "SELECT x, y, type, owner_id, text FROM structures"
  ).all();

  const thinkingMap = {};
  const actionMap = {};
  for (const evt of events) {
    const data = JSON.parse(evt.data || '{}');
    if (evt.type === 'thinking') {
      thinkingMap[evt.agent_id] = data.thinking;
      actionMap[evt.agent_id] = data.action;
    }
  }

  io.emit('world', {
    tick,
    agents: agents.map(a => ({
      ...a,
      thinking: thinkingMap[a.id] || null,
      last_action: actionMap[a.id] || null,
    })),
    world: { width, height },
    structures,
  });

  const chat = getPublicChatSince(db, tick - 1);
  if (chat.length > 0) {
    io.emit('chat', chat);
  }

  for (const agent of agents) {
    if (thinkingMap[agent.id] || actionMap[agent.id]) {
      io.to(`agent:${agent.id}`).emit('agent_update', {
        ...agent,
        thinking: thinkingMap[agent.id],
        last_action: actionMap[agent.id],
      });
    }
  }
}
