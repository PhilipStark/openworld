import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from '../src/db.js';
import { generateWorld } from '../src/world.js';
import { registerAgent, connectAgent, getAgent, getInventory } from '../src/agent.js';
import { processTick } from '../src/gameLoop.js';

describe('gameLoop', () => {
  let db;

  beforeEach(() => {
    db = createDb(':memory:');
    generateWorld(db, 20, 20);
  });
  afterEach(() => { db.close(); });

  it('processTick decrements busy_ticks_remaining', () => {
    const { id } = registerAgent(db, 'Gatherer');
    connectAgent(db, id);
    db.prepare("UPDATE agents SET busy_action = 'gather', busy_ticks_remaining = 3 WHERE id = ?").run(id);

    processTick(db, 1);
    const agent = getAgent(db, id);
    expect(agent.busy_ticks_remaining).toBe(2);
  });

  it('completes gather action when ticks reach 0', () => {
    const { id } = registerAgent(db, 'Gatherer');
    connectAgent(db, id);
    const forestTile = db.prepare("SELECT x, y FROM tiles WHERE type = 'forest' AND resource = 'wood' LIMIT 1").get();
    db.prepare("UPDATE agents SET x = ?, y = ?, busy_action = 'gather', busy_ticks_remaining = 1 WHERE id = ?")
      .run(forestTile.x, forestTile.y, id);

    processTick(db, 1);
    const agent = getAgent(db, id);
    expect(agent.busy_action).toBeNull();
    const inv = getInventory(db, id);
    expect(inv.find(i => i.item === 'wood')).toBeDefined();
  });

  it('exhaustion kicks in at 0 energy', () => {
    const { id } = registerAgent(db, 'Tired');
    connectAgent(db, id);
    db.prepare("UPDATE agents SET energy = 0 WHERE id = ?").run(id);

    processTick(db, 1);
    const agent = getAgent(db, id);
    expect(agent.status).toBe('exhausted');
  });

  it('hunger drains HP at day boundary when no food', () => {
    const { id } = registerAgent(db, 'Hungry');
    connectAgent(db, id);

    // AutoEat is staggered: agent eats at tick where (tick % 2400) == hash(id) % 100
    // Process all ticks in the 0-99 window to guarantee the agent's bucket is hit
    for (let t = 0; t < 100; t++) {
      processTick(db, t);
    }
    const agent = getAgent(db, id);
    expect(agent.hp).toBe(99);
  });

  it('auto-eats food at day boundary', () => {
    const { id } = registerAgent(db, 'Fed');
    connectAgent(db, id);
    db.prepare("UPDATE agents SET hp = 80 WHERE id = ?").run(id);
    db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'bread', 1)").run(id);

    // Process all ticks in the stagger window
    for (let t = 2400; t < 2500; t++) {
      processTick(db, t);
    }
    const agent = getAgent(db, id);
    expect(agent.hp).toBe(100);
  });
});
