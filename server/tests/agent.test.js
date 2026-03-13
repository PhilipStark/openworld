import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from '../src/db.js';
import { generateWorld } from '../src/world.js';
import {
  registerAgent, connectAgent, disconnectAgent,
  getAgent, getAgentByToken, buildPerception
} from '../src/agent.js';

describe('agent', () => {
  let db;

  beforeEach(() => {
    db = createDb(':memory:');
    generateWorld(db, 20, 20);
  });
  afterEach(() => { db.close(); });

  it('registers an agent with name and returns token', () => {
    const result = registerAgent(db, 'TestBot');
    expect(result.id).toBeDefined();
    expect(result.token).toBeDefined();
    expect(result.name).toBe('TestBot');
  });

  it('rejects duplicate name', () => {
    registerAgent(db, 'TestBot');
    expect(() => registerAgent(db, 'TestBot')).toThrow();
  });

  it('connects agent — sets status to awake and spawns on passable tile', () => {
    const { id } = registerAgent(db, 'TestBot');
    connectAgent(db, id);
    const agent = getAgent(db, id);
    expect(agent.status).toBe('awake');
    expect(agent.hp).toBe(100);
    expect(agent.energy).toBe(100);
  });

  it('disconnects agent — sets status to sleeping', () => {
    const { id } = registerAgent(db, 'TestBot');
    connectAgent(db, id);
    disconnectAgent(db, id);
    const agent = getAgent(db, id);
    expect(agent.status).toBe('sleeping');
  });

  it('getAgentByToken returns correct agent', () => {
    const { token } = registerAgent(db, 'TestBot');
    const agent = getAgentByToken(db, token);
    expect(agent.name).toBe('TestBot');
  });

  it('buildPerception returns correct shape', () => {
    const { id } = registerAgent(db, 'TestBot');
    connectAgent(db, id);
    const perception = buildPerception(db, id, 5, 1);
    expect(perception).toHaveProperty('position');
    expect(perception).toHaveProperty('hp');
    expect(perception).toHaveProperty('energy');
    expect(perception).toHaveProperty('inventory');
    expect(perception).toHaveProperty('nearby_agents');
    expect(perception).toHaveProperty('nearby_resources');
    expect(perception).toHaveProperty('nearby_structures');
    expect(perception).toHaveProperty('messages');
    expect(perception).toHaveProperty('pending_trades');
    expect(perception).toHaveProperty('world_time');
    expect(perception).toHaveProperty('tick');
  });
});
