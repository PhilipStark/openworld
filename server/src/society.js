/**
 * Society systems — GTA RP model for AI agents
 * Gold economy, shops, bulletin board, reputation
 */
import { v4 as uuid } from 'uuid';

// ─── BULLETIN BOARD ─────────────────────────────────────────────

export function handlePostBulletin(db, agent, params, tick) {
  const message = (params?.message || '').slice(0, 280);
  const category = params?.category || 'general';
  if (!message) return { ok: false, error: 'empty_message', message: 'Need a message to post' };

  const validCategories = ['general', 'trade', 'job', 'warning', 'event'];
  if (!validCategories.includes(category)) {
    return { ok: false, error: 'invalid_category', message: `Category must be: ${validCategories.join(', ')}` };
  }

  // Must be near town center (plaza or sign)
  const nearPlaza = db.prepare(
    "SELECT x FROM tiles WHERE type = 'plaza' AND ABS(x - ?) + ABS(y - ?) <= 3 LIMIT 1"
  ).get(agent.x, agent.y);

  const nearSign = db.prepare(
    "SELECT id FROM structures WHERE type = 'sign' AND ABS(x - ?) + ABS(y - ?) <= 2 LIMIT 1"
  ).get(agent.x, agent.y);

  if (!nearPlaza && !nearSign) {
    return { ok: false, error: 'not_near_board', message: 'Must be near town plaza or a sign to post' };
  }

  // Max 5 active posts per agent
  const postCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM bulletin_posts WHERE agent_id = ? AND (expires_at_tick IS NULL OR expires_at_tick > ?)"
  ).get(agent.id, tick).cnt;
  if (postCount >= 5) {
    return { ok: false, error: 'too_many_posts', message: 'Max 5 active posts. Old posts expire after 1 day.' };
  }

  const expiresAt = tick + 2400; // 1 game day
  db.prepare(
    "INSERT INTO bulletin_posts (agent_id, message, category, created_at_tick, expires_at_tick) VALUES (?, ?, ?, ?, ?)"
  ).run(agent.id, message, category, tick, expiresAt);

  return { ok: true, tick, result: { posted: true, category, expires_at_tick: expiresAt } };
}

export function handleReadBulletin(db, agent, params, tick) {
  // Can read from anywhere (news travels)
  const category = params?.category;
  let posts;
  if (category) {
    posts = db.prepare(
      "SELECT bp.id, bp.message, bp.category, bp.created_at_tick, a.name as author FROM bulletin_posts bp JOIN agents a ON a.id = bp.agent_id WHERE bp.category = ? AND (bp.expires_at_tick IS NULL OR bp.expires_at_tick > ?) ORDER BY bp.created_at_tick DESC LIMIT 20"
    ).all(category, tick);
  } else {
    posts = db.prepare(
      "SELECT bp.id, bp.message, bp.category, bp.created_at_tick, a.name as author FROM bulletin_posts bp JOIN agents a ON a.id = bp.agent_id WHERE bp.expires_at_tick IS NULL OR bp.expires_at_tick > ? ORDER BY bp.created_at_tick DESC LIMIT 20"
    ).all(tick);
  }

  return { ok: true, tick, result: { posts } };
}

// ─── GOLD ECONOMY ───────────────────────────────────────────────

export function handlePayGold(db, agent, params, tick) {
  const { agent_id: targetId, amount, reason } = params || {};
  if (!targetId || !amount || amount <= 0) {
    return { ok: false, error: 'invalid_params', message: 'Need agent_id and amount' };
  }
  if (!Number.isInteger(amount)) {
    return { ok: false, error: 'invalid_amount', message: 'Amount must be integer' };
  }

  const target = db.prepare("SELECT * FROM agents WHERE id = ? OR name = ?").get(targetId, targetId);
  if (!target) return { ok: false, error: 'target_not_found', message: 'Target not found' };
  if (target.id === agent.id) return { ok: false, error: 'self_pay', message: 'Cannot pay yourself' };

  if (agent.gold < amount) {
    return { ok: false, error: 'not_enough_gold', message: `Need ${amount} gold, have ${agent.gold}` };
  }

  const dist = Math.abs(agent.x - target.x) + Math.abs(agent.y - target.y);
  if (dist > 1) return { ok: false, error: 'not_adjacent', message: 'Must be adjacent to pay' };

  db.prepare("UPDATE agents SET gold = gold - ? WHERE id = ?").run(amount, agent.id);
  db.prepare("UPDATE agents SET gold = gold + ? WHERE id = ?").run(amount, target.id);

  // Log the transaction
  db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'payment', ?, ?)").run(
    tick, agent.id, JSON.stringify({ to: target.id, to_name: target.name, amount, reason: reason || '' })
  );

  return { ok: true, tick, result: { paid: amount, to: target.name, your_gold: agent.gold - amount } };
}

// ─── SHOPS ──────────────────────────────────────────────────────

export function handleCreateShop(db, agent, params, tick) {
  const { direction } = params || {};
  if (!direction) return { ok: false, error: 'invalid_params', message: 'Need direction to place shop' };

  const DIRECTION_OFFSETS = {
    north: { dx: 0, dy: -1 }, south: { dx: 0, dy: 1 },
    east: { dx: 1, dy: 0 }, west: { dx: -1, dy: 0 },
  };

  const offset = DIRECTION_OFFSETS[direction];
  if (!offset) return { ok: false, error: 'invalid_direction', message: 'Direction must be north/south/east/west' };

  // Check materials: 5 wood + 3 stone
  const hasWood = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = 'wood'").get(agent.id);
  const hasStone = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = 'stone'").get(agent.id);
  if (!hasWood || hasWood.qty < 5 || !hasStone || hasStone.qty < 3) {
    return { ok: false, error: 'missing_materials', message: 'Need 5 wood + 3 stone to build a shop' };
  }

  const tx = agent.x + offset.dx;
  const ty = agent.y + offset.dy;
  const tile = db.prepare("SELECT * FROM tiles WHERE x = ? AND y = ?").get(tx, ty);
  if (!tile) return { ok: false, error: 'out_of_bounds' };
  if (tile.type === 'water' || tile.type === 'mountain') return { ok: false, error: 'invalid_tile', message: 'Cannot build shop there' };

  const existing = db.prepare("SELECT id FROM structures WHERE x = ? AND y = ?").get(tx, ty);
  if (existing) return { ok: false, error: 'tile_occupied', message: 'Structure already exists' };

  const shopId = uuid().slice(0, 8);

  db.prepare("UPDATE items SET qty = qty - 5 WHERE agent_id = ? AND item = 'wood'").run(agent.id);
  db.prepare("UPDATE items SET qty = qty - 3 WHERE agent_id = ? AND item = 'stone'").run(agent.id);
  db.prepare("DELETE FROM items WHERE agent_id = ? AND qty <= 0").run(agent.id);

  db.prepare(
    "INSERT INTO structures (id, x, y, type, owner_id, text, created_at_tick) VALUES (?, ?, ?, 'shop', ?, ?, ?)"
  ).run(shopId, tx, ty, agent.id, `${agent.name}'s Shop`, tick);

  return { ok: true, tick, result: { shop_id: shopId, at: { x: tx, y: ty } } };
}

export function handleListItem(db, agent, params, tick) {
  const { item, price, qty } = params || {};
  if (!item || !price || !qty || price <= 0 || qty <= 0) {
    return { ok: false, error: 'invalid_params', message: 'Need item, price (gold), and qty' };
  }

  // Find agent's shop nearby
  const shop = db.prepare(
    "SELECT * FROM structures WHERE type = 'shop' AND owner_id = ? AND ABS(x - ?) + ABS(y - ?) <= 1"
  ).get(agent.id, agent.x, agent.y);
  if (!shop) return { ok: false, error: 'no_shop', message: 'No owned shop nearby' };

  // Check agent has the items
  const has = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agent.id, item);
  if (!has || has.qty < qty) {
    return { ok: false, error: 'not_enough_items', message: `Not enough ${item}` };
  }

  // Move items from inventory to shop listing
  db.prepare("UPDATE items SET qty = qty - ? WHERE agent_id = ? AND item = ?").run(qty, agent.id, item);
  db.prepare("DELETE FROM items WHERE agent_id = ? AND item = ? AND qty <= 0").run(agent.id, item);

  db.prepare(
    "INSERT INTO shop_listings (agent_id, structure_id, item, price, qty) VALUES (?, ?, ?, ?, ?)"
  ).run(agent.id, shop.id, item, price, qty);

  return { ok: true, tick, result: { listed: item, price, qty, shop_id: shop.id } };
}

export function handleBuyItem(db, agent, params, tick) {
  const { listing_id, qty } = params || {};
  if (!listing_id || !qty || qty <= 0) {
    return { ok: false, error: 'invalid_params', message: 'Need listing_id and qty' };
  }

  const listing = db.prepare("SELECT * FROM shop_listings WHERE id = ?").get(listing_id);
  if (!listing || listing.qty <= 0) {
    return { ok: false, error: 'listing_not_found', message: 'Listing not found or sold out' };
  }

  if (listing.agent_id === agent.id) {
    return { ok: false, error: 'own_listing', message: 'Cannot buy from your own shop' };
  }

  // Must be near the shop
  const shop = db.prepare("SELECT * FROM structures WHERE id = ?").get(listing.structure_id);
  if (!shop) return { ok: false, error: 'shop_not_found', message: 'Shop not found' };

  const dist = Math.abs(agent.x - shop.x) + Math.abs(agent.y - shop.y);
  if (dist > 1) return { ok: false, error: 'not_near_shop', message: 'Must be adjacent to shop' };

  const buyQty = Math.min(qty, listing.qty);
  const totalCost = listing.price * buyQty;

  if (agent.gold < totalCost) {
    return { ok: false, error: 'not_enough_gold', message: `Need ${totalCost} gold, have ${agent.gold}` };
  }

  // Check buyer inventory capacity
  const invCount = db.prepare("SELECT COUNT(*) as cnt FROM items WHERE agent_id = ?").get(agent.id).cnt;
  const hasItem = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agent.id, listing.item);
  if (invCount >= 20 && !hasItem) {
    return { ok: false, error: 'inventory_full', message: 'Inventory full' };
  }

  const executeBuy = db.transaction(() => {
    // Transfer gold
    db.prepare("UPDATE agents SET gold = gold - ? WHERE id = ?").run(totalCost, agent.id);
    db.prepare("UPDATE agents SET gold = gold + ? WHERE id = ?").run(totalCost, listing.agent_id);

    // Give items to buyer
    if (hasItem) {
      db.prepare("UPDATE items SET qty = qty + ? WHERE agent_id = ? AND item = ?").run(buyQty, agent.id, listing.item);
    } else {
      db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, ?, ?)").run(agent.id, listing.item, buyQty);
    }

    // Update listing
    if (buyQty >= listing.qty) {
      db.prepare("DELETE FROM shop_listings WHERE id = ?").run(listing_id);
    } else {
      db.prepare("UPDATE shop_listings SET qty = qty - ? WHERE id = ?").run(buyQty, listing_id);
    }

    // Log transaction
    db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'shop_purchase', ?, ?)").run(
      tick, agent.id, JSON.stringify({
        item: listing.item, qty: buyQty, price: listing.price,
        total: totalCost, seller: listing.agent_id, shop: listing.structure_id
      })
    );
  });
  executeBuy();

  return { ok: true, tick, result: { bought: listing.item, qty: buyQty, total_gold: totalCost, gold_remaining: agent.gold - totalCost } };
}

export function handleViewShop(db, agent, params, tick) {
  // Find nearby shop
  const shop = db.prepare(
    "SELECT * FROM structures WHERE type = 'shop' AND ABS(x - ?) + ABS(y - ?) <= 2"
  ).get(agent.x, agent.y);
  if (!shop) return { ok: false, error: 'no_shop_nearby', message: 'No shop nearby' };

  const listings = db.prepare(
    "SELECT sl.id, sl.item, sl.price, sl.qty, a.name as seller FROM shop_listings sl JOIN agents a ON a.id = sl.agent_id WHERE sl.structure_id = ? AND sl.qty > 0"
  ).all(shop.id);

  return { ok: true, tick, result: { shop_id: shop.id, owner: shop.owner_id, listings } };
}

// ─── CLEANUP ────────────────────────────────────────────────────

export function cleanupExpiredPosts(db, tick) {
  db.prepare("DELETE FROM bulletin_posts WHERE expires_at_tick IS NOT NULL AND expires_at_tick <= ?").run(tick);
}
