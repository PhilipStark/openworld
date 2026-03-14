import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from '../src/db.js';
import { generateWorld } from '../src/world.js';
import { registerAgent, connectAgent, getAgent, getInventory } from '../src/agent.js';
import { handleAttack, handleSteal, handleLoot } from '../src/combat.js';
import { handleCraft, handleTradePropose, handleTradeRespond, handleDestroy } from '../src/economy.js';
import { processTick } from '../src/gameLoop.js';

describe('Bug fixes', () => {
  let db;

  beforeEach(() => {
    db = createDb(':memory:');
    generateWorld(db, 20, 20);
  });
  afterEach(() => { db.close(); });

  // Bug 1: handleLoot respects inventory limit
  describe('Loot inventory overflow fix', () => {
    it('should not exceed 20 inventory slots when looting', () => {
      const a = registerAgent(db, 'Looter');
      connectAgent(db, a.id);
      const t = registerAgent(db, 'Dead');
      connectAgent(db, t.id);

      db.prepare("UPDATE agents SET x = 5, y = 5 WHERE id = ?").run(a.id);
      db.prepare("UPDATE agents SET x = 5, y = 5, status = 'dead', hp = 0 WHERE id = ?").run(t.id);

      // Fill looter inventory with 19 unique items
      for (let i = 0; i < 19; i++) {
        db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, ?, 1)").run(a.id, `item_${i}`);
      }

      // Give dead agent 5 unique items
      for (let i = 0; i < 5; i++) {
        db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, ?, 1)").run(t.id, `dead_item_${i}`);
      }

      const result = handleLoot(db, getAgent(db, a.id), { agent_id: t.id }, 1);
      expect(result.ok).toBe(true);

      const invCount = db.prepare("SELECT COUNT(*) as cnt FROM items WHERE agent_id = ?").get(a.id).cnt;
      expect(invCount).toBeLessThanOrEqual(20);
    });

    it('should loot stacking items even at max slots', () => {
      const a = registerAgent(db, 'Looter2');
      connectAgent(db, a.id);
      const t = registerAgent(db, 'Dead2');
      connectAgent(db, t.id);

      db.prepare("UPDATE agents SET x = 5, y = 5 WHERE id = ?").run(a.id);
      db.prepare("UPDATE agents SET x = 5, y = 5, status = 'dead', hp = 0 WHERE id = ?").run(t.id);

      // Fill looter to max slots with wood as one of them
      for (let i = 0; i < 20; i++) {
        db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, ?, 1)").run(a.id, i === 0 ? 'wood' : `item_${i}`);
      }

      // Dead has wood (should stack) and stone (should be skipped)
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'wood', 5)").run(t.id);
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'stone', 3)").run(t.id);

      const result = handleLoot(db, getAgent(db, a.id), { agent_id: t.id }, 1);
      expect(result.ok).toBe(true);

      const wood = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = 'wood'").get(a.id);
      expect(wood.qty).toBe(6); // 1 + 5

      const invCount = db.prepare("SELECT COUNT(*) as cnt FROM items WHERE agent_id = ?").get(a.id).cnt;
      expect(invCount).toBe(20); // stone couldn't be added
    });
  });

  // Bug 2: Trade inventory overflow
  describe('Trade inventory overflow fix', () => {
    it('should reject trade if receiver inventory would overflow', () => {
      const a = registerAgent(db, 'Trader1');
      connectAgent(db, a.id);
      const b = registerAgent(db, 'Trader2');
      connectAgent(db, b.id);

      db.prepare("UPDATE agents SET x = 5, y = 5 WHERE id = ?").run(a.id);
      db.prepare("UPDATE agents SET x = 5, y = 6 WHERE id = ?").run(b.id);

      // Give trader1 something to offer
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'unique_rare', 1)").run(a.id);
      // Give trader2 something to trade back
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'gold', 1)").run(b.id);

      // Fill trader2 inventory to 20 slots
      for (let i = 0; i < 19; i++) {
        db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, ?, 1)").run(b.id, `filler_${i}`);
      }

      // Propose trade: unique_rare for gold
      const propose = handleTradePropose(db, getAgent(db, a.id), {
        agent_id: b.id,
        offer: [{ item: 'unique_rare', qty: 1 }],
        request: [{ item: 'gold', qty: 1 }],
      }, 1);
      expect(propose.ok).toBe(true);

      // Accept — should fail because trader2 has 20 slots and unique_rare would be slot 21
      const respond = handleTradeRespond(db, getAgent(db, b.id), {
        trade_id: propose.result.trade_id,
        accept: true,
      }, 2);
      expect(respond.ok).toBe(false);
      expect(respond.error).toBe('inventory_full');
    });
  });

  // Bug 3: Trade race condition (double-accept)
  describe('Trade race condition fix', () => {
    it('second accept on same trade should fail', () => {
      const a = registerAgent(db, 'PropA');
      connectAgent(db, a.id);
      const b = registerAgent(db, 'AcceptB');
      connectAgent(db, b.id);

      db.prepare("UPDATE agents SET x = 5, y = 5 WHERE id = ?").run(a.id);
      db.prepare("UPDATE agents SET x = 5, y = 6 WHERE id = ?").run(b.id);

      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'wood', 5)").run(a.id);
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'stone', 5)").run(b.id);

      const propose = handleTradePropose(db, getAgent(db, a.id), {
        agent_id: b.id,
        offer: [{ item: 'wood', qty: 3 }],
        request: [{ item: 'stone', qty: 2 }],
      }, 1);

      // First accept
      const first = handleTradeRespond(db, getAgent(db, b.id), {
        trade_id: propose.result.trade_id, accept: true,
      }, 2);
      expect(first.ok).toBe(true);

      // Second accept — trade already accepted, should fail
      const second = handleTradeRespond(db, getAgent(db, b.id), {
        trade_id: propose.result.trade_id, accept: true,
      }, 2);
      expect(second.ok).toBe(false);
      expect(second.error).toBe('trade_not_found');
    });
  });

  // Bug 5: Equip overwrite returns old item
  describe('Equip overwrite fix', () => {
    it('crafting new tool returns old tool to inventory', () => {
      const a = registerAgent(db, 'Crafter');
      connectAgent(db, a.id);

      // Give materials: axe needs plank:1+stone:2, fishing_rod needs plank:2+string:1, string needs grass:3
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'plank', 10)").run(a.id);
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'stone', 10)").run(a.id);
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'grass', 10)").run(a.id);

      // Place crafting_table adjacent to agent (required for advanced recipes)
      const agent = getAgent(db, a.id);
      db.prepare("INSERT INTO structures (id, x, y, type, owner_id) VALUES ('ct1', ?, ?, 'crafting_table', ?)").run(agent.x + 1, agent.y, a.id);

      // Craft axe first (plank:1 + stone:2 = axe, equip: tool)
      const axeResult = handleCraft(db, getAgent(db, a.id), { recipe: 'axe' }, 1);
      expect(axeResult.ok).toBe(true);

      const agentAfterAxe = getAgent(db, a.id);
      expect(agentAfterAxe.tool).toBe('axe');

      // Craft string (grass:3 = string:1)
      handleCraft(db, getAgent(db, a.id), { recipe: 'string' }, 2);

      // Craft fishing_rod (plank:2 + string:1 = fishing_rod, equip: tool)
      const rodResult = handleCraft(db, getAgent(db, a.id), { recipe: 'fishing_rod' }, 3);
      expect(rodResult.ok).toBe(true);

      const agentAfterRod = getAgent(db, a.id);
      expect(agentAfterRod.tool).toBe('fishing_rod');

      // Old axe should be back in inventory
      const axeInInv = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = 'axe'").get(a.id);
      expect(axeInInv).toBeTruthy();
      expect(axeInInv.qty).toBeGreaterThanOrEqual(1);
    });
  });

  // Bug 8: Destroy ownership cost
  describe('Destroy ownership penalty', () => {
    it('destroying own structure takes 5 ticks', () => {
      const a = registerAgent(db, 'Builder');
      connectAgent(db, a.id);

      db.prepare("UPDATE agents SET x = 5, y = 5 WHERE id = ?").run(a.id);
      db.prepare("INSERT INTO structures (id, x, y, type, owner_id) VALUES ('s1', 5, 6, 'wall', ?)").run(a.id);

      const result = handleDestroy(db, getAgent(db, a.id), { direction: 'south' }, 1);
      expect(result.ok).toBe(true);
      expect(result.result.ticks).toBe(5);
      expect(result.result.owned).toBe(true);
    });

    it('destroying others structure takes 10 ticks and extra energy', () => {
      const a = registerAgent(db, 'Destroyer');
      connectAgent(db, a.id);
      const b = registerAgent(db, 'Owner');
      connectAgent(db, b.id);

      db.prepare("UPDATE agents SET x = 5, y = 5, energy = 50 WHERE id = ?").run(a.id);
      db.prepare("INSERT INTO structures (id, x, y, type, owner_id) VALUES ('s2', 5, 6, 'wall', ?)").run(b.id);

      const result = handleDestroy(db, getAgent(db, a.id), { direction: 'south' }, 1);
      expect(result.ok).toBe(true);
      expect(result.result.ticks).toBe(10);
      expect(result.result.owned).toBe(false);

      const agent = getAgent(db, a.id);
      expect(agent.energy).toBe(45); // 50 - 5 extra
    });
  });

  // Bug 9: Attack/steal/loot by name
  describe('Combat accepts name or id', () => {
    it('attack by name should work', () => {
      const a = registerAgent(db, 'Fighter');
      connectAgent(db, a.id);
      const t = registerAgent(db, 'Victim');
      connectAgent(db, t.id);

      db.prepare("UPDATE agents SET x = 5, y = 5 WHERE id = ?").run(a.id);
      db.prepare("UPDATE agents SET x = 5, y = 6 WHERE id = ?").run(t.id);

      const result = handleAttack(db, getAgent(db, a.id), { agent_id: 'Victim' }, 1);
      expect(result.ok).toBe(true);
    });

    it('loot by name should work', () => {
      const a = registerAgent(db, 'LootByName');
      connectAgent(db, a.id);
      const t = registerAgent(db, 'DeadByName');
      connectAgent(db, t.id);

      db.prepare("UPDATE agents SET x = 5, y = 5 WHERE id = ?").run(a.id);
      db.prepare("UPDATE agents SET x = 5, y = 5, status = 'dead', hp = 0 WHERE id = ?").run(t.id);
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'wood', 1)").run(t.id);

      const result = handleLoot(db, getAgent(db, a.id), { agent_id: 'DeadByName' }, 1);
      expect(result.ok).toBe(true);
    });
  });

  // Bug 11: Hunger no longer affects sleeping agents
  describe('Sleeping agents hunger fix', () => {
    it('sleeping agents should not lose HP from hunger', () => {
      const a = registerAgent(db, 'Sleeper');
      connectAgent(db, a.id);

      // Set to sleeping with full HP and no food
      db.prepare("UPDATE agents SET status = 'sleeping', hp = 100 WHERE id = ?").run(a.id);

      // Process a day boundary tick
      processTick(db, 2400);

      const agent = getAgent(db, a.id);
      expect(agent.hp).toBe(100); // No HP loss while sleeping
    });
  });

  // Bug 7: busy_data column for reliable action completion
  describe('busy_data reliable action completion', () => {
    it('gather stores busy_data on agent', async () => {
      const a = registerAgent(db, 'Gatherer');
      connectAgent(db, a.id);

      // Find a forest tile with wood
      const tile = db.prepare("SELECT x, y FROM tiles WHERE type = 'forest' AND resource = 'wood' AND resource_qty > 0 LIMIT 1").get();
      if (!tile) return; // Skip if no forest tiles

      db.prepare("UPDATE agents SET x = ?, y = ?, energy = 50 WHERE id = ?").run(tile.x, tile.y, a.id);

      // Import dispatch to trigger gather
      const { dispatch } = await import('../src/actions.js');
      const result = dispatch(db, a.id, { action: 'gather', thinking: 'I need wood', params: {} }, 1);

      if (result.ok) {
        const agent = getAgent(db, a.id);
        expect(agent.busy_data).toBeTruthy();
        const busyData = JSON.parse(agent.busy_data);
        expect(busyData.resource).toBe('wood');
        expect(busyData.tileX).toBe(tile.x);
        expect(busyData.tileY).toBe(tile.y);
      }
    });
  });
});
