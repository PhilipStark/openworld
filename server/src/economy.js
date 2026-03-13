import { v4 as uuid } from 'uuid';
import { getAgent, getInventory } from './agent.js';

const RECIPES = {
  plank:          { input: { wood: 1 },                output: { planks: 2 } },
  sword:          { input: { wood: 1, stone: 2 },      output: { sword: 1 },    equip: 'weapon' },
  shield:         { input: { wood: 2, stone: 1 },      output: { shield: 1 },   equip: 'shield' },
  axe:            { input: { wood: 2, stone: 1 },      output: { axe: 1 },      equip: 'tool' },
  string:         { input: { grass: 3 },                output: { string: 1 } },
  fishing_rod:    { input: { wood: 2, string: 1 },     output: { fishing_rod: 1 }, equip: 'tool' },
  bread:          { input: { wheat: 2 },                output: { bread: 1 } },
  stone_block:    { input: { stone: 2 },                output: { stone_block: 1 } },
};

const BUILD_COSTS = {
  shelter:        { wood: 5 },
  storage:        { wood: 5, stone: 3 },
  crafting_table: { wood: 3, stone: 2 },
  bridge:         { wood: 5, stone: 2 },
  wall:           { stone_block: 3 },
  door:           { planks: 2 },
};

const BUILD_TICKS_MAP = {
  shelter: 5, storage: 5, crafting_table: 3,
  bridge: 10, wall: 5, door: 5,
};

const VALID_EQUIP_SLOTS = new Set(['weapon', 'shield', 'tool']);

const DIRECTION_OFFSETS = {
  north: { dx: 0, dy: -1 }, south: { dx: 0, dy: 1 },
  east:  { dx: 1, dy: 0 },  west:  { dx: -1, dy: 0 },
};

function hasItems(db, agentId, requirements) {
  for (const [item, qty] of Object.entries(requirements)) {
    const row = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agentId, item);
    if (!row || row.qty < qty) return false;
  }
  return true;
}

function removeItems(db, agentId, requirements) {
  for (const [item, qty] of Object.entries(requirements)) {
    db.prepare("UPDATE items SET qty = qty - ? WHERE agent_id = ? AND item = ?").run(qty, agentId, item);
    db.prepare("DELETE FROM items WHERE agent_id = ? AND item = ? AND qty <= 0").run(agentId, item);
  }
}

function addItems(db, agentId, items) {
  for (const [item, qty] of Object.entries(items)) {
    const existing = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agentId, item);
    if (existing) {
      db.prepare("UPDATE items SET qty = qty + ? WHERE agent_id = ? AND item = ?").run(qty, agentId, item);
    } else {
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, ?, ?)").run(agentId, item, qty);
    }
  }
}

export function handleCraft(db, agent, params, tick) {
  const recipeName = params?.recipe;
  const recipe = RECIPES[recipeName];
  if (!recipe) return { ok: false, error: 'unknown_recipe', message: `Unknown recipe: ${recipeName}` };

  if (!hasItems(db, agent.id, recipe.input)) {
    return { ok: false, error: 'missing_materials', message: `Missing materials for ${recipeName}` };
  }

  const invCount = db.prepare("SELECT COUNT(*) as cnt FROM items WHERE agent_id = ?").get(agent.id).cnt;
  const outputItems = Object.keys(recipe.output);
  const newSlots = outputItems.filter(item =>
    !db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agent.id, item)
  ).length;
  if (invCount + newSlots > 20) {
    return { ok: false, error: 'inventory_full', message: 'Inventory full (20 slots)' };
  }

  removeItems(db, agent.id, recipe.input);
  addItems(db, agent.id, recipe.output);

  if (recipe.equip) {
    if (!VALID_EQUIP_SLOTS.has(recipe.equip)) throw new Error(`Invalid equip slot: ${recipe.equip}`);
    const equipItem = Object.keys(recipe.output)[0];
    db.prepare(`UPDATE agents SET ${recipe.equip} = ? WHERE id = ?`).run(equipItem, agent.id);
  }

  return { ok: true, tick, result: { crafted: recipeName, output: recipe.output } };
}

export function handleGive(db, agent, params, tick) {
  const { agent_id: targetId, item, qty } = params || {};
  if (!targetId || !item || !qty || qty <= 0) {
    return { ok: false, error: 'invalid_params', message: 'Need agent_id, item, qty' };
  }

  const target = db.prepare("SELECT * FROM agents WHERE id = ? OR name = ?").get(targetId, targetId);
  if (!target) return { ok: false, error: 'target_not_found', message: 'Target not found' };

  const dist = Math.abs(agent.x - target.x) + Math.abs(agent.y - target.y);
  if (dist > 1) return { ok: false, error: 'not_adjacent', message: 'Must be adjacent to give' };

  if (!hasItems(db, agent.id, { [item]: qty })) {
    return { ok: false, error: 'not_enough_items', message: `Not enough ${item}` };
  }

  removeItems(db, agent.id, { [item]: qty });
  addItems(db, target.id, { [item]: qty });

  return { ok: true, tick, result: { gave: item, qty, to: target.name } };
}

export function handleTradePropose(db, agent, params, tick) {
  const { agent_id: targetId, offer, request: requested } = params || {};
  if (!targetId || !offer || !requested) {
    return { ok: false, error: 'invalid_params', message: 'Need agent_id, offer, request' };
  }

  const target = db.prepare("SELECT * FROM agents WHERE id = ? OR name = ?").get(targetId, targetId);
  if (!target) return { ok: false, error: 'target_not_found', message: 'Target not found' };

  const dist = Math.abs(agent.x - target.x) + Math.abs(agent.y - target.y);
  if (dist > 1) return { ok: false, error: 'not_adjacent', message: 'Must be adjacent to trade' };

  const offerMap = {};
  for (const o of offer) { offerMap[o.item] = (offerMap[o.item] || 0) + o.qty; }
  if (!hasItems(db, agent.id, offerMap)) {
    return { ok: false, error: 'not_enough_items', message: 'Not enough items to offer' };
  }

  const tradeId = uuid().slice(0, 8);
  const expiresTick = tick + 5;

  const executeTrade = db.transaction(() => {
    removeItems(db, agent.id, offerMap);
    db.prepare(
      "INSERT INTO trades (id, from_id, to_id, offer, request, expires_tick) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(tradeId, agent.id, target.id, JSON.stringify(offer), JSON.stringify(requested), expiresTick);
  });
  executeTrade();

  return { ok: true, tick, result: { trade_id: tradeId, expires_tick: expiresTick } };
}

export function handleTradeRespond(db, agent, params, tick) {
  const { trade_id: tradeId, accept } = params || {};
  if (!tradeId) return { ok: false, error: 'invalid_params', message: 'Need trade_id' };

  const trade = db.prepare("SELECT * FROM trades WHERE id = ? AND status = 'pending'").get(tradeId);
  if (!trade) return { ok: false, error: 'trade_not_found', message: 'Trade not found or not pending' };
  if (trade.to_id !== agent.id) return { ok: false, error: 'not_your_trade', message: 'This trade is not for you' };

  if (trade.expires_tick <= tick) {
    returnEscrow(db, trade);
    db.prepare("UPDATE trades SET status = 'expired' WHERE id = ?").run(tradeId);
    return { ok: false, error: 'trade_expired', message: 'Trade has expired' };
  }

  if (!accept) {
    returnEscrow(db, trade);
    db.prepare("UPDATE trades SET status = 'rejected' WHERE id = ?").run(tradeId);
    return { ok: true, tick, result: { rejected: true } };
  }

  const requested = JSON.parse(trade.request);
  const requestMap = {};
  for (const r of requested) { requestMap[r.item] = (requestMap[r.item] || 0) + r.qty; }

  if (!hasItems(db, agent.id, requestMap)) {
    return { ok: false, error: 'not_enough_items', message: 'Not enough items to complete trade' };
  }

  removeItems(db, agent.id, requestMap);
  addItems(db, trade.from_id, requestMap);

  const offer = JSON.parse(trade.offer);
  const offerMap = {};
  for (const o of offer) { offerMap[o.item] = (offerMap[o.item] || 0) + o.qty; }
  addItems(db, agent.id, offerMap);

  db.prepare("UPDATE trades SET status = 'accepted' WHERE id = ?").run(tradeId);
  return { ok: true, tick, result: { accepted: true } };
}

function returnEscrow(db, trade) {
  const offer = JSON.parse(trade.offer);
  const offerMap = {};
  for (const o of offer) { offerMap[o.item] = (offerMap[o.item] || 0) + o.qty; }
  addItems(db, trade.from_id, offerMap);
}

export function expireTrades(db, tick) {
  const expired = db.prepare("SELECT * FROM trades WHERE status = 'pending' AND expires_tick <= ?").all(tick);
  for (const trade of expired) {
    returnEscrow(db, trade);
    db.prepare("UPDATE trades SET status = 'expired' WHERE id = ?").run(trade.id);
  }
}

export function getTradesForAgent(db, agentId) {
  return db.prepare(
    "SELECT * FROM trades WHERE (from_id = ? OR to_id = ?) AND status = 'pending'"
  ).all(agentId, agentId).map(t => ({
    trade_id: t.id,
    from: t.from_id,
    to: t.to_id,
    offer: JSON.parse(t.offer),
    request: JSON.parse(t.request),
    expires_tick: t.expires_tick,
  }));
}

export function handleBuild(db, agent, params, tick) {
  const { structure, direction } = params || {};
  if (!structure || !direction) return { ok: false, error: 'invalid_params', message: 'Need structure and direction' };

  const cost = BUILD_COSTS[structure];
  if (!cost) return { ok: false, error: 'unknown_structure', message: `Unknown structure: ${structure}` };

  const offset = DIRECTION_OFFSETS[direction];
  if (!offset) return { ok: false, error: 'invalid_direction', message: 'Direction must be north/south/east/west' };

  if (!hasItems(db, agent.id, cost)) {
    return { ok: false, error: 'missing_materials', message: `Missing materials for ${structure}` };
  }

  const targetX = agent.x + offset.dx;
  const targetY = agent.y + offset.dy;

  const tile = db.prepare("SELECT * FROM tiles WHERE x = ? AND y = ?").get(targetX, targetY);
  if (!tile) return { ok: false, error: 'out_of_bounds', message: 'Cannot build outside world' };
  if (tile.type === 'water' || tile.type === 'mountain') {
    if (structure !== 'bridge') return { ok: false, error: 'invalid_tile', message: `Cannot build ${structure} on ${tile.type}` };
  }

  const existing = db.prepare("SELECT id FROM structures WHERE x = ? AND y = ?").get(targetX, targetY);
  if (existing) return { ok: false, error: 'tile_occupied', message: 'Structure already exists on this tile' };

  removeItems(db, agent.id, cost);

  const ticks = BUILD_TICKS_MAP[structure] || 5;
  db.prepare("UPDATE agents SET busy_action = 'build', busy_ticks_remaining = ? WHERE id = ?").run(ticks, agent.id);

  db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'build_start', ?, ?)").run(
    tick, agent.id, JSON.stringify({ structure, x: targetX, y: targetY })
  );

  return { ok: true, tick, result: { building: structure, ticks: BUILD_TICKS_MAP[structure], at: { x: targetX, y: targetY } } };
}

export function handlePlaceSign(db, agent, params, tick) {
  const { text } = params || {};
  if (!text) return { ok: false, error: 'invalid_params', message: 'Need text' };

  const existing = db.prepare("SELECT id FROM structures WHERE x = ? AND y = ?").get(agent.x, agent.y);
  if (existing) return { ok: false, error: 'tile_occupied', message: 'Tile already has a structure' };

  db.prepare("UPDATE agents SET busy_action = 'place_sign', busy_ticks_remaining = 2 WHERE id = ?").run(agent.id);

  db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'place_sign_start', ?, ?)").run(
    tick, agent.id, JSON.stringify({ text: text.slice(0, 140), x: agent.x, y: agent.y })
  );

  return { ok: true, tick, result: { placing_sign: true, ticks: 2, text: text.slice(0, 140) } };
}

export function handleDestroy(db, agent, params, tick) {
  const { direction } = params || {};
  if (!direction) return { ok: false, error: 'invalid_params', message: 'Need direction' };

  const offset = DIRECTION_OFFSETS[direction];
  if (!offset) return { ok: false, error: 'invalid_direction', message: 'Invalid direction' };

  const targetX = agent.x + offset.dx;
  const targetY = agent.y + offset.dy;

  const structure = db.prepare("SELECT * FROM structures WHERE x = ? AND y = ?").get(targetX, targetY);
  if (!structure) return { ok: false, error: 'no_structure', message: 'No structure to destroy' };

  db.prepare("UPDATE agents SET busy_action = 'destroy', busy_ticks_remaining = 5 WHERE id = ?").run(agent.id);

  db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'destroy_start', ?, ?)").run(
    tick, agent.id, JSON.stringify({ structure_id: structure.id, x: targetX, y: targetY })
  );

  return { ok: true, tick, result: { destroying: structure.type, ticks: 5, at: { x: targetX, y: targetY } } };
}
