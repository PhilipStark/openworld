// server/src/actions.js
import { getAgent, buildPerception } from './agent.js';
import { getTile } from './world.js';
import * as combatHandlers from './combat.js';
import * as economyHandlers from './economy.js';
import * as societyHandlers from './society.js';

const DIRECTION_OFFSETS = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

const ENERGY_COSTS = {
  move: 1, speak: 0, whisper: 0, gather: 3, craft: 2, build: 5,
  give: 0, trade_propose: 0, trade_respond: 0, place_sign: 1,
  attack: 5, steal: 3, loot: 1, destroy: 5, look: 0, rest: 0,
  set_bio: 0, cancel: 0, eat: 0, deposit: 0, withdraw: 0,
  post_bulletin: 1, read_bulletin: 0, pay_gold: 0,
  create_shop: 5, list_item: 0, buy_item: 0, view_shop: 0,
};

const FOOD_ITEMS = {
  bread: { hp: 20, energy: 15 },
  fish: { hp: 15, energy: 10 },
  berries: { hp: 5, energy: 5 },
};

export function dispatch(db, agentId, actionData, tick) {
  if (!actionData.thinking && actionData.action !== 'cancel') {
    return { ok: false, error: 'thinking_required', message: 'thinking field is required' };
  }

  if (actionData.thinking && actionData.thinking.length > 500) {
    return { ok: false, error: 'thinking_too_long', message: 'thinking max 500 chars' };
  }

  const agent = getAgent(db, agentId);
  if (!agent) return { ok: false, error: 'agent_not_found', message: 'Agent not found' };
  if (agent.status !== 'awake') return { ok: false, error: 'agent_not_awake', message: `Agent is ${agent.status}` };

  if (actionData.action === 'cancel') {
    db.prepare("UPDATE agents SET busy_action = NULL, busy_ticks_remaining = 0, busy_data = NULL WHERE id = ?").run(agentId);
    return { ok: true, tick, result: { cancelled: true } };
  }

  if (agent.busy_action) {
    return { ok: false, error: 'agent_busy', message: `Agent is ${agent.busy_action} (${agent.busy_ticks_remaining} ticks remaining)` };
  }

  const energyCost = ENERGY_COSTS[actionData.action] ?? 0;
  if (agent.energy < energyCost) {
    return { ok: false, error: 'not_enough_energy', message: `Need ${energyCost} energy, have ${agent.energy}` };
  }

  if (actionData.thinking) {
    db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'thinking', ?, ?)").run(
      tick, agentId, JSON.stringify({ thinking: actionData.thinking, action: actionData.action })
    );
  }

  // Deduct energy AFTER action succeeds (passed as callback)
  const deductEnergy = () => {
    if (energyCost > 0) {
      db.prepare("UPDATE agents SET energy = MAX(0, energy - ?) WHERE id = ?").run(energyCost, agentId);
    }
  };

  let result;
  switch (actionData.action) {
    case 'move': result = handleMove(db, agent, actionData.params, tick); break;
    case 'look': result = handleLook(db, agent, tick); break;
    case 'rest': result = handleRest(db, agent, tick); break;
    case 'set_bio': result = handleSetBio(db, agent, actionData.params, tick); break;
    case 'gather': result = handleGather(db, agent, actionData.params, tick); break;
    case 'eat': result = handleEat(db, agent, actionData.params, tick); break;
    case 'deposit': result = handleDeposit(db, agent, actionData.params, tick); break;
    case 'withdraw': result = handleWithdraw(db, agent, actionData.params, tick); break;
    case 'speak': result = handleSpeak(db, agent, actionData.params, tick); break;
    case 'whisper': result = handleWhisper(db, agent, actionData.params, tick); break;
    case 'attack': result = combatHandlers.handleAttack(db, agent, actionData.params, tick); break;
    case 'steal': result = combatHandlers.handleSteal(db, agent, actionData.params, tick); break;
    case 'loot': result = combatHandlers.handleLoot(db, agent, actionData.params, tick); break;
    case 'craft': result = economyHandlers.handleCraft(db, agent, actionData.params, tick); break;
    case 'give': result = economyHandlers.handleGive(db, agent, actionData.params, tick); break;
    case 'trade_propose': result = economyHandlers.handleTradePropose(db, agent, actionData.params, tick); break;
    case 'trade_respond': result = economyHandlers.handleTradeRespond(db, agent, actionData.params, tick); break;
    case 'build': result = economyHandlers.handleBuild(db, agent, actionData.params, tick); break;
    case 'place_sign': result = economyHandlers.handlePlaceSign(db, agent, actionData.params, tick); break;
    case 'destroy': result = economyHandlers.handleDestroy(db, agent, actionData.params, tick); break;
    case 'post_bulletin': result = societyHandlers.handlePostBulletin(db, agent, actionData.params, tick); break;
    case 'read_bulletin': result = societyHandlers.handleReadBulletin(db, agent, actionData.params, tick); break;
    case 'pay_gold': result = societyHandlers.handlePayGold(db, agent, actionData.params, tick); break;
    case 'create_shop': result = societyHandlers.handleCreateShop(db, agent, actionData.params, tick); break;
    case 'list_item': result = societyHandlers.handleListItem(db, agent, actionData.params, tick); break;
    case 'buy_item': result = societyHandlers.handleBuyItem(db, agent, actionData.params, tick); break;
    case 'view_shop': result = societyHandlers.handleViewShop(db, agent, actionData.params, tick); break;
    default:
      return { ok: false, error: 'unknown_action', message: `Unknown action: ${actionData.action}` };
  }

  // Only deduct energy if action succeeded
  if (result.ok) deductEnergy();

  return result;
}

function handleMove(db, agent, params, tick) {
  const offset = DIRECTION_OFFSETS[params?.direction];
  if (!offset) return { ok: false, error: 'invalid_direction', message: 'Direction must be north/south/east/west' };

  const newX = agent.x + offset.dx;
  const newY = agent.y + offset.dy;
  const tile = getTile(db, newX, newY);

  if (!tile) return { ok: false, error: 'out_of_bounds', message: 'Cannot move outside world' };

  if (tile.type === 'water' || tile.type === 'mountain') {
    const bridge = db.prepare("SELECT id FROM structures WHERE x = ? AND y = ? AND type = 'bridge'").get(newX, newY);
    if (!bridge) return { ok: false, error: 'impassable_tile', message: `Cannot walk on ${tile.type}` };
  }

  const blocking = db.prepare(
    "SELECT * FROM structures WHERE x = ? AND y = ? AND type IN ('wall')"
  ).get(newX, newY);
  if (blocking) return { ok: false, error: 'blocked_by_structure', message: 'Path blocked by wall' };

  const door = db.prepare("SELECT * FROM structures WHERE x = ? AND y = ? AND type = 'door'").get(newX, newY);
  if (door && door.owner_id && door.owner_id !== agent.id) {
    return { ok: false, error: 'blocked_by_door', message: 'Door is locked (not your door)' };
  }

  db.prepare("UPDATE agents SET x = ?, y = ? WHERE id = ?").run(newX, newY, agent.id);
  return { ok: true, tick, result: { new_position: { x: newX, y: newY } } };
}

function handleLook(db, agent, tick) {
  const perception = buildPerception(db, agent.id, 10, tick);
  return { ok: true, tick, result: { perception } };
}

function handleRest(db, agent, tick) {
  // Shelter bonus: +20 energy instead of +10
  const shelter = db.prepare("SELECT id FROM structures WHERE x = ? AND y = ? AND type = 'shelter'").get(agent.x, agent.y);
  const restAmount = shelter ? 20 : 10;
  const newEnergy = Math.min(100, agent.energy + restAmount);
  db.prepare("UPDATE agents SET energy = ? WHERE id = ?").run(newEnergy, agent.id);
  return { ok: true, tick, result: { energy: newEnergy, shelter_bonus: !!shelter } };
}

function handleSetBio(db, agent, params, tick) {
  const text = (params?.text || '').slice(0, 280);
  db.prepare("UPDATE agents SET bio = ? WHERE id = ?").run(text, agent.id);
  return { ok: true, tick, result: { bio: text } };
}

function handleGather(db, agent, params, tick) {
  const direction = params?.direction;
  let tileX = agent.x, tileY = agent.y;

  // If direction given, target the adjacent tile
  if (direction) {
    const offset = DIRECTION_OFFSETS[direction];
    if (!offset) return { ok: false, error: 'invalid_direction', message: 'Direction must be north/south/east/west' };
    tileX = agent.x + offset.dx;
    tileY = agent.y + offset.dy;
  }

  let tile = getTile(db, tileX, tileY);

  // Fishing: if target tile is water, check for fishing rod
  if (tile && tile.type === 'water') {
    if (!tile.resource || tile.resource_qty <= 0) {
      return { ok: false, error: 'no_resource', message: 'No fish on this water tile' };
    }
    const rod = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = 'fishing_rod'").get(agent.id);
    if (!rod) return { ok: false, error: 'need_fishing_rod', message: 'Need fishing rod to fish' };
  } else if (!tile || !tile.resource || tile.resource_qty <= 0) {
    // No resource on target — if no direction was given, try adjacent water as fallback
    if (!direction) {
      const adjacentWater = db.prepare(
        "SELECT x, y, type, resource, resource_qty FROM tiles WHERE type = 'water' AND resource = 'fish' AND resource_qty > 0 AND ABS(x - ?) + ABS(y - ?) = 1 LIMIT 1"
      ).get(agent.x, agent.y);
      if (adjacentWater) {
        const rod = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = 'fishing_rod'").get(agent.id);
        if (!rod) return { ok: false, error: 'need_fishing_rod', message: 'Need fishing rod to fish' };
        tile = adjacentWater;
        tileX = adjacentWater.x;
        tileY = adjacentWater.y;
      } else {
        return { ok: false, error: 'no_resource', message: 'No resource here. Use direction to gather from adjacent tile.' };
      }
    } else {
      return { ok: false, error: 'no_resource', message: 'No resource on target tile' };
    }
  }

  if (!tile || !tile.resource || tile.resource_qty <= 0) {
    return { ok: false, error: 'no_resource', message: 'No resource on target tile' };
  }

  const invCount = db.prepare("SELECT COUNT(*) as cnt FROM items WHERE agent_id = ?").get(agent.id).cnt;
  const hasItem = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agent.id, tile.resource);
  if (invCount >= 20 && !hasItem) {
    return { ok: false, error: 'inventory_full', message: 'Inventory full (20 slots)' };
  }

  let gatherTicks = 3;
  if (tile.resource === 'wood' && agent.tool === 'axe') gatherTicks = 2;

  const busyData = JSON.stringify({ resource: tile.resource, tileX: tile.x, tileY: tile.y });
  db.prepare("UPDATE agents SET busy_action = 'gather', busy_ticks_remaining = ?, busy_data = ? WHERE id = ?").run(gatherTicks, busyData, agent.id);

  db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'gather_start', ?, ?)").run(
    tick, agent.id, busyData
  );

  return { ok: true, tick, result: { gathering: tile.resource, ticks: gatherTicks } };
}

function handleEat(db, agent, params, tick) {
  const item = params?.item;
  if (!item) {
    // Auto-pick best food
    const foodOrder = ['berries', 'fish', 'bread'];
    for (const foodName of foodOrder) {
      const food = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agent.id, foodName);
      if (food && food.qty > 0) {
        const stats = FOOD_ITEMS[foodName];
        const newHp = Math.min(100, agent.hp + stats.hp);
        const newEnergy = Math.min(100, agent.energy + stats.energy);
        db.prepare("UPDATE agents SET hp = ?, energy = ? WHERE id = ?").run(newHp, newEnergy, agent.id);
        db.prepare("UPDATE items SET qty = qty - 1 WHERE agent_id = ? AND item = ?").run(agent.id, foodName);
        db.prepare("DELETE FROM items WHERE agent_id = ? AND item = ? AND qty <= 0").run(agent.id, foodName);
        return { ok: true, tick, result: { ate: foodName, hp: newHp, energy: newEnergy } };
      }
    }
    return { ok: false, error: 'no_food', message: 'No food in inventory (need berries, fish, or bread)' };
  }

  const stats = FOOD_ITEMS[item];
  if (!stats) return { ok: false, error: 'not_food', message: `${item} is not edible` };

  const has = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agent.id, item);
  if (!has || has.qty <= 0) return { ok: false, error: 'not_enough_items', message: `No ${item} in inventory` };

  const newHp = Math.min(100, agent.hp + stats.hp);
  const newEnergy = Math.min(100, agent.energy + stats.energy);
  db.prepare("UPDATE agents SET hp = ?, energy = ? WHERE id = ?").run(newHp, newEnergy, agent.id);
  db.prepare("UPDATE items SET qty = qty - 1 WHERE agent_id = ? AND item = ?").run(agent.id, item);
  db.prepare("DELETE FROM items WHERE agent_id = ? AND item = ? AND qty <= 0").run(agent.id, item);

  return { ok: true, tick, result: { ate: item, hp: newHp, energy: newEnergy } };
}

function handleDeposit(db, agent, params, tick) {
  const { item, qty } = params || {};
  if (!item || !qty || qty <= 0) return { ok: false, error: 'invalid_params', message: 'Need item and qty' };

  // Find adjacent or same-tile storage owned by agent
  const storage = db.prepare(
    "SELECT * FROM structures WHERE type = 'storage' AND owner_id = ? AND ABS(x - ?) + ABS(y - ?) <= 1"
  ).get(agent.id, agent.x, agent.y);
  if (!storage) return { ok: false, error: 'no_storage', message: 'No owned storage nearby' };

  const has = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agent.id, item);
  if (!has || has.qty < qty) return { ok: false, error: 'not_enough_items', message: `Not enough ${item}` };

  // Check storage capacity (max 50 slots)
  const storageSlots = db.prepare("SELECT COUNT(*) as cnt FROM storage_items WHERE structure_id = ?").get(storage.id).cnt;
  const existingInStorage = db.prepare("SELECT qty FROM storage_items WHERE structure_id = ? AND item = ?").get(storage.id, item);
  if (storageSlots >= 50 && !existingInStorage) {
    return { ok: false, error: 'storage_full', message: 'Storage full (50 slots)' };
  }

  // Move items
  db.prepare("UPDATE items SET qty = qty - ? WHERE agent_id = ? AND item = ?").run(qty, agent.id, item);
  db.prepare("DELETE FROM items WHERE agent_id = ? AND item = ? AND qty <= 0").run(agent.id, item);

  if (existingInStorage) {
    db.prepare("UPDATE storage_items SET qty = qty + ? WHERE structure_id = ? AND item = ?").run(qty, storage.id, item);
  } else {
    db.prepare("INSERT INTO storage_items (structure_id, item, qty) VALUES (?, ?, ?)").run(storage.id, item, qty);
  }

  return { ok: true, tick, result: { deposited: item, qty, storage_id: storage.id } };
}

function handleWithdraw(db, agent, params, tick) {
  const { item, qty } = params || {};
  if (!item || !qty || qty <= 0) return { ok: false, error: 'invalid_params', message: 'Need item and qty' };

  // Find adjacent or same-tile storage owned by agent
  const storage = db.prepare(
    "SELECT * FROM structures WHERE type = 'storage' AND owner_id = ? AND ABS(x - ?) + ABS(y - ?) <= 1"
  ).get(agent.id, agent.x, agent.y);
  if (!storage) return { ok: false, error: 'no_storage', message: 'No owned storage nearby' };

  const stored = db.prepare("SELECT qty FROM storage_items WHERE structure_id = ? AND item = ?").get(storage.id, item);
  if (!stored || stored.qty < qty) return { ok: false, error: 'not_in_storage', message: `Not enough ${item} in storage` };

  // Check inventory capacity
  const invCount = db.prepare("SELECT COUNT(*) as cnt FROM items WHERE agent_id = ?").get(agent.id).cnt;
  const hasInInv = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agent.id, item);
  if (invCount >= 20 && !hasInInv) return { ok: false, error: 'inventory_full', message: 'Inventory full (20 slots)' };

  // Move items
  db.prepare("UPDATE storage_items SET qty = qty - ? WHERE structure_id = ? AND item = ?").run(qty, storage.id, item);
  db.prepare("DELETE FROM storage_items WHERE structure_id = ? AND item = ? AND qty <= 0").run(storage.id, item);

  if (hasInInv) {
    db.prepare("UPDATE items SET qty = qty + ? WHERE agent_id = ? AND item = ?").run(qty, agent.id, item);
  } else {
    db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, ?, ?)").run(agent.id, item, qty);
  }

  return { ok: true, tick, result: { withdrew: item, qty, storage_id: storage.id } };
}

function handleSpeak(db, agent, params, tick) {
  const message = (params?.message || '').slice(0, 280);
  if (!message) return { ok: false, error: 'empty_message', message: 'Cannot speak nothing' };

  db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'speak', ?, ?)").run(
    tick, agent.id, JSON.stringify({ message, x: agent.x, y: agent.y })
  );

  return { ok: true, tick, result: { spoke: message } };
}

function handleWhisper(db, agent, params, tick) {
  const message = (params?.message || '').slice(0, 280);
  const targetId = params?.agent_id;
  if (!message || !targetId) return { ok: false, error: 'invalid_params', message: 'Need agent_id and message' };

  const target = db.prepare("SELECT * FROM agents WHERE id = ? OR name = ?").get(targetId, targetId);
  if (!target) return { ok: false, error: 'target_not_found', message: 'Target agent not found' };

  const dist = Math.abs(agent.x - target.x) + Math.abs(agent.y - target.y);
  if (dist > 1) return { ok: false, error: 'not_adjacent', message: 'Must be adjacent to whisper' };

  db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'whisper', ?, ?)").run(
    tick, agent.id, JSON.stringify({ message, target_id: target.id })
  );

  return { ok: true, tick, result: { whispered_to: target.name } };
}
