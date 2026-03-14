import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from '../src/db.js';
import { generateWorld } from '../src/world.js';
import { registerAgent, connectAgent, getAgent, getInventory } from '../src/agent.js';
import { handleCraft, handleGive, handleTradePropose, handleTradeRespond, handleBuild, handlePlaceSign, handleDestroy, getTradesForAgent, expireTrades } from '../src/economy.js';

describe('economy', () => {
  let db, agentId, otherId;

  beforeEach(() => {
    db = createDb(':memory:');
    generateWorld(db, 20, 20);
    const a = registerAgent(db, 'Crafter');
    agentId = a.id;
    connectAgent(db, agentId);
    const b = registerAgent(db, 'Trader');
    otherId = b.id;
    connectAgent(db, otherId);
    db.prepare("UPDATE agents SET x = 5, y = 5 WHERE id = ?").run(agentId);
    db.prepare("UPDATE agents SET x = 5, y = 6 WHERE id = ?").run(otherId);
  });
  afterEach(() => { db.close(); });

  it('craft plank: 1 wood -> 2 planks (spec)', () => {
    db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'wood', 3)").run(agentId);
    const result = handleCraft(db, getAgent(db, agentId), { recipe: 'plank' }, 1);
    expect(result.ok).toBe(true);
    const inv = getInventory(db, agentId);
    const wood = inv.find(i => i.item === 'wood');
    const plank = inv.find(i => i.item === 'plank');
    expect(wood.qty).toBe(2);
    expect(plank.qty).toBe(2);
  });

  it('craft fails without materials', () => {
    const result = handleCraft(db, getAgent(db, agentId), { recipe: 'plank' }, 1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('missing_materials');
  });

  it('give transfers item to adjacent agent', () => {
    db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'wood', 5)").run(agentId);
    const result = handleGive(db, getAgent(db, agentId), { agent_id: otherId, item: 'wood', qty: 3 }, 1);
    expect(result.ok).toBe(true);
    const giverInv = getInventory(db, agentId);
    const receiverInv = getInventory(db, otherId);
    expect(giverInv.find(i => i.item === 'wood').qty).toBe(2);
    expect(receiverInv.find(i => i.item === 'wood').qty).toBe(3);
  });

  it('trade propose -> respond accept transfers items', () => {
    db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'wood', 3)").run(agentId);
    db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'stone', 2)").run(otherId);

    const proposeResult = handleTradePropose(db, getAgent(db, agentId), {
      agent_id: otherId,
      offer: [{ item: 'wood', qty: 3 }],
      request: [{ item: 'stone', qty: 2 }],
    }, 10);
    expect(proposeResult.ok).toBe(true);
    const tradeId = proposeResult.result.trade_id;

    const respondResult = handleTradeRespond(db, getAgent(db, otherId), { trade_id: tradeId, accept: true }, 11);
    expect(respondResult.ok).toBe(true);

    const aInv = getInventory(db, agentId);
    const bInv = getInventory(db, otherId);
    expect(aInv.find(i => i.item === 'stone')?.qty).toBe(2);
    expect(bInv.find(i => i.item === 'wood')?.qty).toBe(3);
  });

  it('trade expires after 5 ticks', () => {
    db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'wood', 3)").run(agentId);
    handleTradePropose(db, getAgent(db, agentId), {
      agent_id: otherId, offer: [{ item: 'wood', qty: 3 }], request: [{ item: 'stone', qty: 2 }],
    }, 10);

    let inv = getInventory(db, agentId);
    expect(inv.find(i => i.item === 'wood')).toBeUndefined();

    expireTrades(db, 16);

    inv = getInventory(db, agentId);
    expect(inv.find(i => i.item === 'wood')?.qty).toBe(3);
  });

  it('build shelter on adjacent empty tile', () => {
    db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'wood', 5)").run(agentId);
    db.prepare("UPDATE tiles SET type = 'grass' WHERE x = 6 AND y = 5").run();
    const result = handleBuild(db, getAgent(db, agentId), { structure: 'shelter', direction: 'east' }, 1);
    expect(result.ok).toBe(true);
    const agent = getAgent(db, agentId);
    expect(agent.busy_action).toBe('build');
  });
});
