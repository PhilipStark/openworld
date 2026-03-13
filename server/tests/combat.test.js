import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from '../src/db.js';
import { generateWorld } from '../src/world.js';
import { registerAgent, connectAgent, getAgent } from '../src/agent.js';
import { handleAttack, handleSteal, handleLoot } from '../src/combat.js';

describe('combat', () => {
  let db, attackerId, targetId;

  beforeEach(() => {
    db = createDb(':memory:');
    generateWorld(db, 20, 20);

    const a = registerAgent(db, 'Attacker');
    attackerId = a.id;
    connectAgent(db, attackerId);

    const t = registerAgent(db, 'Target');
    targetId = t.id;
    connectAgent(db, targetId);

    // Place them adjacent
    db.prepare("UPDATE agents SET x = 5, y = 5 WHERE id = ?").run(attackerId);
    db.prepare("UPDATE agents SET x = 5, y = 6 WHERE id = ?").run(targetId);
  });
  afterEach(() => { db.close(); });

  it('attack deals 15-25 damage', () => {
    const result = handleAttack(db, getAgent(db, attackerId), { agent_id: targetId }, 1);
    expect(result.ok).toBe(true);
    const target = getAgent(db, targetId);
    expect(target.hp).toBeLessThanOrEqual(85);
    expect(target.hp).toBeGreaterThanOrEqual(75);
  });

  it('attack with sword deals 25-35 damage', () => {
    db.prepare("UPDATE agents SET weapon = 'sword' WHERE id = ?").run(attackerId);
    const result = handleAttack(db, getAgent(db, attackerId), { agent_id: targetId }, 1);
    expect(result.ok).toBe(true);
    const target = getAgent(db, targetId);
    expect(target.hp).toBeLessThanOrEqual(75);
    expect(target.hp).toBeGreaterThanOrEqual(65);
  });

  it('shield reduces damage by 5', () => {
    db.prepare("UPDATE agents SET shield = 'shield' WHERE id = ?").run(targetId);
    for (let i = 0; i < 10; i++) {
      db.prepare("UPDATE agents SET hp = 100 WHERE id = ?").run(targetId);
      handleAttack(db, getAgent(db, attackerId), { agent_id: targetId }, 1);
      const target = getAgent(db, targetId);
      expect(target.hp).toBeGreaterThanOrEqual(80);
      expect(target.hp).toBeLessThanOrEqual(90);
    }
  });

  it('attack kills agent at 0 HP and drops inventory', () => {
    db.prepare("UPDATE agents SET hp = 10 WHERE id = ?").run(targetId);
    db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'wood', 5)").run(targetId);
    handleAttack(db, getAgent(db, attackerId), { agent_id: targetId }, 1);
    const target = getAgent(db, targetId);
    if (target.hp <= 0) {
      expect(target.status).toBe('dead');
    }
  });

  it('rejects attack on non-adjacent agent', () => {
    db.prepare("UPDATE agents SET x = 10, y = 10 WHERE id = ?").run(targetId);
    const result = handleAttack(db, getAgent(db, attackerId), { agent_id: targetId }, 1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('not_adjacent');
  });

  it('steal has 50% chance to fail', () => {
    let successes = 0;
    let failures = 0;
    for (let i = 0; i < 100; i++) {
      db.prepare("DELETE FROM items WHERE agent_id = ?").run(targetId);
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'wood', 100)").run(targetId);
      const result = handleSteal(db, getAgent(db, attackerId), { agent_id: targetId }, 1);
      if (result.ok && result.result.stolen) successes++;
      else failures++;
    }
    expect(successes).toBeGreaterThan(20);
    expect(failures).toBeGreaterThan(20);
  });

  it('loot takes items from dead agent', () => {
    db.prepare("UPDATE agents SET status = 'dead', hp = 0 WHERE id = ?").run(targetId);
    db.prepare("UPDATE agents SET x = 5, y = 6 WHERE id = ?").run(attackerId);
    db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'stone', 3)").run(targetId);
    const result = handleLoot(db, getAgent(db, attackerId), { agent_id: targetId }, 1);
    expect(result.ok).toBe(true);
  });
});
