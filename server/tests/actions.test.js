// server/tests/actions.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from '../src/db.js';
import { generateWorld, getTile } from '../src/world.js';
import { registerAgent, connectAgent, getAgent } from '../src/agent.js';
import { dispatch } from '../src/actions.js';

describe('actions', () => {
  let db, agentId;

  beforeEach(() => {
    db = createDb(':memory:');
    generateWorld(db, 20, 20);
    const reg = registerAgent(db, 'Mover');
    agentId = reg.id;
    connectAgent(db, agentId);
    db.prepare("UPDATE agents SET x = 5, y = 5 WHERE id = ?").run(agentId);
  });
  afterEach(() => { db.close(); });

  it('move north decreases y by 1', () => {
    db.prepare("UPDATE tiles SET type = 'grass' WHERE x = 5 AND y = 4").run();
    const result = dispatch(db, agentId, { action: 'move', params: { direction: 'north' }, thinking: 'going north' }, 1);
    expect(result.ok).toBe(true);
    const agent = getAgent(db, agentId);
    expect(agent.y).toBe(4);
  });

  it('move south increases y by 1', () => {
    db.prepare("UPDATE tiles SET type = 'grass' WHERE x = 5 AND y = 6").run();
    const result = dispatch(db, agentId, { action: 'move', params: { direction: 'south' }, thinking: 'going south' }, 1);
    expect(result.ok).toBe(true);
    const agent = getAgent(db, agentId);
    expect(agent.y).toBe(6);
  });

  it('rejects move into water tile', () => {
    db.prepare("UPDATE tiles SET type = 'water', resource = 'fish', resource_qty = 2 WHERE x = 5 AND y = 4").run();
    const result = dispatch(db, agentId, { action: 'move', params: { direction: 'north' }, thinking: 'test' }, 1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('impassable_tile');
  });

  it('move costs 1 energy', () => {
    db.prepare("UPDATE tiles SET type = 'grass' WHERE x = 5 AND y = 4").run();
    const before = getAgent(db, agentId).energy;
    const result = dispatch(db, agentId, { action: 'move', params: { direction: 'north' }, thinking: 'test' }, 1);
    expect(result.ok).toBe(true);
    const after = getAgent(db, agentId).energy;
    expect(after).toBe(before - 1);
  });

  it('rejects action when agent is busy', () => {
    db.prepare("UPDATE agents SET busy_action = 'gather', busy_ticks_remaining = 2 WHERE id = ?").run(agentId);
    const result = dispatch(db, agentId, { action: 'move', params: { direction: 'north' }, thinking: 'test' }, 1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('agent_busy');
  });

  it('cancel clears busy state', () => {
    db.prepare("UPDATE agents SET busy_action = 'gather', busy_ticks_remaining = 2 WHERE id = ?").run(agentId);
    const result = dispatch(db, agentId, { action: 'cancel', params: {}, thinking: 'cancel' }, 1);
    expect(result.ok).toBe(true);
    const agent = getAgent(db, agentId);
    expect(agent.busy_action).toBeNull();
  });

  it('rejects action without thinking field', () => {
    const result = dispatch(db, agentId, { action: 'move', params: { direction: 'north' } }, 1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('thinking_required');
  });

  it('rest recovers 10 energy', () => {
    db.prepare("UPDATE agents SET energy = 50 WHERE id = ?").run(agentId);
    dispatch(db, agentId, { action: 'rest', params: {}, thinking: 'resting' }, 1);
    const agent = getAgent(db, agentId);
    expect(agent.energy).toBe(60);
  });

  it('look returns extended perception', () => {
    const result = dispatch(db, agentId, { action: 'look', params: {}, thinking: 'looking' }, 1);
    expect(result.ok).toBe(true);
    expect(result.result.perception).toBeDefined();
  });
});
