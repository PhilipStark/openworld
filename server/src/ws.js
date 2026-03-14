import { getAwakeAgents, getAgent } from './agent.js';
import { getWorldSize } from './world.js';
import { getPublicChatSince } from './chat.js';

// Previous state for delta computation
let prevAgentState = new Map();
let prevStructures = [];
let prevStructureHash = '';

export function setupWebSocket(io, db) {
  let viewerCount = 0;

  io.on('connection', (socket) => {
    viewerCount++;
    io.emit('viewers', viewerCount);

    // Send tiles with resource info for depleted visuals
    const tiles = db.prepare("SELECT x, y, type, resource, resource_qty FROM tiles").all();
    const { width, height } = getWorldSize(db);
    socket.emit('tiles', { tiles, width, height });

    // Send full initial state so new viewer catches up
    const agents = db.prepare(
      "SELECT id, name, x, y, hp, energy, status, bio, weapon, shield, tool, busy_action, busy_ticks_remaining FROM agents WHERE status != 'dead'"
    ).all();
    const structures = db.prepare(
      "SELECT x, y, type, owner_id, text FROM structures"
    ).all();
    socket.emit('world_full', { agents, structures, world: { width, height } });

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

  const { width, height } = getWorldSize(db);

  // Compute agent deltas
  const agentDeltas = [];
  const currentAgentIds = new Set();
  for (const agent of agents) {
    currentAgentIds.add(agent.id);
    const prev = prevAgentState.get(agent.id);
    if (!prev) {
      // New agent — send full
      agentDeltas.push(agent);
    } else {
      // Only send if something changed
      const changed = {};
      let hasChange = false;
      for (const key of ['x', 'y', 'hp', 'energy', 'status', 'weapon', 'shield', 'tool', 'busy_action', 'busy_ticks_remaining', 'bio', 'name']) {
        if (agent[key] !== prev[key]) {
          changed[key] = agent[key];
          hasChange = true;
        }
      }
      if (hasChange) {
        changed.id = agent.id;
        agentDeltas.push(changed);
      }
    }
    prevAgentState.set(agent.id, { ...agent });
  }

  // Detect removed agents (died/disconnected)
  const removedAgents = [];
  for (const [id] of prevAgentState) {
    if (!currentAgentIds.has(id)) {
      removedAgents.push(id);
      prevAgentState.delete(id);
    }
  }

  // Structures delta — only send if changed (structures change rarely)
  const structures = db.prepare(
    "SELECT x, y, type, owner_id, text FROM structures"
  ).all();
  const structHash = JSON.stringify(structures);
  const structuresChanged = structHash !== prevStructureHash;
  prevStructureHash = structHash;

  // Events for this tick (thinking/action)
  const events = db.prepare(
    "SELECT * FROM events WHERE tick = ? ORDER BY id ASC"
  ).all(tick);

  const thinkingMap = {};
  const actionMap = {};
  const speechMap = {};
  for (const evt of events) {
    const data = JSON.parse(evt.data || '{}');
    if (evt.type === 'thinking') {
      thinkingMap[evt.agent_id] = data.thinking;
      actionMap[evt.agent_id] = data.action;
    }
    if (evt.type === 'speak') {
      speechMap[evt.agent_id] = data.message;
    }
  }

  // Add thinking/action/speech to deltas
  for (const delta of agentDeltas) {
    if (thinkingMap[delta.id]) delta.thinking = thinkingMap[delta.id];
    if (actionMap[delta.id]) delta.last_action = actionMap[delta.id];
    if (speechMap[delta.id]) delta.speech = speechMap[delta.id];
  }

  // Also add thinking/speech for agents that didn't change position
  const enrichedIds = new Set(agentDeltas.map(d => d.id));
  for (const agentId of new Set([...Object.keys(thinkingMap), ...Object.keys(speechMap)])) {
    if (!enrichedIds.has(agentId)) {
      agentDeltas.push({
        id: agentId,
        thinking: thinkingMap[agentId],
        last_action: actionMap[agentId],
        speech: speechMap[agentId],
      });
    }
  }

  // Send compact delta
  const payload = { tick, world: { width, height } };
  if (agentDeltas.length > 0) payload.agents = agentDeltas;
  if (removedAgents.length > 0) payload.removed = removedAgents;
  if (structuresChanged) payload.structures = structures;

  io.emit('tick', payload);

  // Chat
  const chat = getPublicChatSince(db, tick - 1);
  if (chat.length > 0) {
    io.emit('chat', chat);
  }

  // Agent-specific updates for followers
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
