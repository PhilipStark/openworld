import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from '../src/db.js';
import { generateWorld } from '../src/world.js';
import { registerAgent, connectAgent } from '../src/agent.js';
import { getMessagesForAgent, getPublicChatSince } from '../src/chat.js';

describe('chat', () => {
  let db, speakerId, listenerId;

  beforeEach(() => {
    db = createDb(':memory:');
    generateWorld(db, 20, 20);

    const a = registerAgent(db, 'Speaker');
    speakerId = a.id;
    connectAgent(db, speakerId);

    const b = registerAgent(db, 'Listener');
    listenerId = b.id;
    connectAgent(db, listenerId);

    db.prepare("UPDATE agents SET x = 5, y = 5 WHERE id = ?").run(speakerId);
    db.prepare("UPDATE agents SET x = 7, y = 5 WHERE id = ?").run(listenerId);
  });
  afterEach(() => { db.close(); });

  it('getMessagesForAgent returns speak events within radius', () => {
    db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (1, 'speak', ?, ?)").run(
      speakerId, JSON.stringify({ message: 'hello', x: 5, y: 5 })
    );

    const msgs = getMessagesForAgent(db, listenerId, 7, 5, 0, 2);
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toBe('hello');
  });

  it('does not include speak events outside radius', () => {
    db.prepare("UPDATE agents SET x = 15, y = 15 WHERE id = ?").run(listenerId);
    db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (1, 'speak', ?, ?)").run(
      speakerId, JSON.stringify({ message: 'hello', x: 5, y: 5 })
    );
    const msgs = getMessagesForAgent(db, listenerId, 15, 15, 0, 2);
    expect(msgs.length).toBe(0);
  });

  it('getPublicChatSince returns all speak events', () => {
    db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (1, 'speak', ?, ?)").run(
      speakerId, JSON.stringify({ message: 'hello world', x: 5, y: 5 })
    );
    const chat = getPublicChatSince(db, 0);
    expect(chat.length).toBe(1);
  });
});
