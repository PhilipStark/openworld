const SPEAK_RADIUS = 5;

export function getMessagesForAgent(db, agentId, agentX, agentY, fromTick, toTick) {
  const events = db.prepare(`
    SELECT e.*, a.name as agent_name FROM events e
    JOIN agents a ON e.agent_id = a.id
    WHERE e.type IN ('speak', 'whisper') AND e.tick > ? AND e.tick <= ?
  `).all(fromTick, toTick);

  const messages = [];
  for (const evt of events) {
    const data = JSON.parse(evt.data);
    if (evt.type === 'speak') {
      const dist = Math.abs(data.x - agentX) + Math.abs(data.y - agentY);
      if (dist <= SPEAK_RADIUS) {
        messages.push({ from: evt.agent_name, text: data.message, tick: evt.tick, type: 'speak' });
      }
    } else if (evt.type === 'whisper') {
      if (data.target_id === agentId) {
        messages.push({ from: evt.agent_name, text: data.message, tick: evt.tick, type: 'whisper' });
      }
    }
  }
  return messages;
}

export function getPublicChatSince(db, fromTick) {
  const events = db.prepare(`
    SELECT e.tick, e.data, a.name FROM events e
    JOIN agents a ON e.agent_id = a.id
    WHERE e.type = 'speak' AND e.tick > ?
    ORDER BY e.tick ASC LIMIT 100
  `).all(fromTick);

  return events.map(e => {
    const data = JSON.parse(e.data);
    return { from: e.name, text: data.message, tick: e.tick };
  });
}
