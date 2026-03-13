import { getAwakeAgents, getAgent, getInventory } from './agent.js';
import { shouldExpand, expandWorld, getTile } from './world.js';
import { expireTrades } from './economy.js';

const DAY_LENGTH = 2400;

const FOOD_ITEMS = {
  bread: { hp: 20, energy: 15 },
  fish: { hp: 15, energy: 10 },
  berries: { hp: 5, energy: 5 },
};

export function processTick(db, tick) {
  // 1. Process busy agents
  const busyAgents = db.prepare(
    "SELECT * FROM agents WHERE status IN ('awake', 'exhausted') AND busy_action IS NOT NULL AND busy_ticks_remaining > 0"
  ).all();

  for (const agent of busyAgents) {
    const remaining = agent.busy_ticks_remaining - 1;
    if (remaining <= 0) {
      completeBusyAction(db, agent, tick);
    } else {
      db.prepare("UPDATE agents SET busy_ticks_remaining = ? WHERE id = ?").run(remaining, agent.id);
    }
  }

  // 2. Handle exhaustion recovery
  const recovering = db.prepare("SELECT * FROM agents WHERE status = 'exhausted' AND busy_action IS NULL AND busy_ticks_remaining <= 0").all();
  for (const agent of recovering) {
    db.prepare("UPDATE agents SET status = 'awake', energy = 20 WHERE id = ?").run(agent.id);
  }

  // 3. Handle exhaustion onset
  const exhausted = db.prepare("SELECT * FROM agents WHERE status = 'awake' AND energy <= 0").all();
  for (const agent of exhausted) {
    db.prepare("UPDATE agents SET status = 'exhausted', busy_action = 'rest', busy_ticks_remaining = 5 WHERE id = ?").run(agent.id);
  }

  // 4. Day boundary: hunger + auto-eat (only for awake and exhausted, not sleeping)
  if (tick % DAY_LENGTH === 0 && tick > 0) {
    const alive = db.prepare("SELECT * FROM agents WHERE status IN ('awake', 'exhausted')").all();
    for (const agent of alive) {
      autoEat(db, agent, tick);
    }
  }

  // 5. Expire trades
  expireTrades(db, tick);

  // 6. Resource respawn (every 10 day/night cycles)
  if (tick % (DAY_LENGTH * 10) === 0 && tick > 0) {
    respawnResources(db);
  }

  // 7. World expansion check
  const agentCount = db.prepare("SELECT COUNT(*) as cnt FROM agents WHERE status != 'dead'").get().cnt;
  if (shouldExpand(db, agentCount)) {
    expandWorld(db, 25);
  }
}

function completeBusyAction(db, agent, tick) {
  // Use busy_data stored on agent (reliable) with fallback to events (legacy)
  let busyDataParsed = null;
  if (agent.busy_data) {
    try { busyDataParsed = JSON.parse(agent.busy_data); } catch (e) { /* ignore */ }
  }

  if (agent.busy_action === 'gather') {
    let tileX = agent.x, tileY = agent.y;
    let resource = null;

    if (busyDataParsed) {
      tileX = busyDataParsed.tileX; tileY = busyDataParsed.tileY; resource = busyDataParsed.resource;
    } else {
      // Legacy fallback: query events table
      const gatherEvent = db.prepare(
        "SELECT data FROM events WHERE type = 'gather_start' AND agent_id = ? ORDER BY id DESC LIMIT 1"
      ).get(agent.id);
      if (gatherEvent) {
        const data = JSON.parse(gatherEvent.data);
        tileX = data.tileX; tileY = data.tileY; resource = data.resource;
      }
    }

    const tile = getTile(db, tileX, tileY);
    const res = resource || (tile && tile.resource);
    if (tile && res && tile.resource_qty > 0) {
      const existing = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agent.id, res);
      if (existing) {
        db.prepare("UPDATE items SET qty = qty + 1 WHERE agent_id = ? AND item = ?").run(agent.id, res);
      } else {
        // Check inventory capacity before adding new slot
        const invCount = db.prepare("SELECT COUNT(*) as cnt FROM items WHERE agent_id = ?").get(agent.id).cnt;
        if (invCount < 20) {
          db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, ?, 1)").run(agent.id, res);
        }
      }
      db.prepare("UPDATE tiles SET resource_qty = resource_qty - 1 WHERE x = ? AND y = ?").run(tileX, tileY);
    }
  }

  if (agent.busy_action === 'build') {
    let structure, x, y;

    if (busyDataParsed) {
      ({ structure, x, y } = busyDataParsed);
    } else {
      const buildEvent = db.prepare(
        "SELECT data FROM events WHERE type = 'build_start' AND agent_id = ? ORDER BY id DESC LIMIT 1"
      ).get(agent.id);
      if (buildEvent) {
        ({ structure, x, y } = JSON.parse(buildEvent.data));
      }
    }

    if (structure && x !== undefined && y !== undefined) {
      const structureId = Math.random().toString(36).slice(2, 10);
      db.prepare(
        "INSERT OR IGNORE INTO structures (id, x, y, type, owner_id, created_at_tick) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(structureId, x, y, structure, agent.id, tick);
    }
  }

  if (agent.busy_action === 'place_sign') {
    let text, x, y;

    if (busyDataParsed) {
      ({ text, x, y } = busyDataParsed);
    } else {
      const signEvent = db.prepare(
        "SELECT data FROM events WHERE type = 'place_sign_start' AND agent_id = ? ORDER BY id DESC LIMIT 1"
      ).get(agent.id);
      if (signEvent) {
        ({ text, x, y } = JSON.parse(signEvent.data));
      }
    }

    if (text && x !== undefined && y !== undefined) {
      const signId = Math.random().toString(36).slice(2, 10);
      db.prepare(
        "INSERT OR IGNORE INTO structures (id, x, y, type, owner_id, text, created_at_tick) VALUES (?, ?, ?, 'sign', ?, ?, ?)"
      ).run(signId, x, y, agent.id, text, tick);
    }
  }

  if (agent.busy_action === 'destroy') {
    let x, y;

    if (busyDataParsed) {
      ({ x, y } = busyDataParsed);
    } else {
      const destroyEvent = db.prepare(
        "SELECT data FROM events WHERE type = 'destroy_start' AND agent_id = ? ORDER BY id DESC LIMIT 1"
      ).get(agent.id);
      if (destroyEvent) {
        ({ x, y } = JSON.parse(destroyEvent.data));
      }
    }

    if (x !== undefined && y !== undefined) {
      db.prepare("DELETE FROM structures WHERE x = ? AND y = ?").run(x, y);
    }
  }

  db.prepare("UPDATE agents SET busy_action = NULL, busy_ticks_remaining = 0, busy_data = NULL WHERE id = ?").run(agent.id);
}

function autoEat(db, agent, tick) {
  const inventory = getInventory(db, agent.id);
  const foodOrder = ['berries', 'fish', 'bread'];

  let ate = false;
  for (const foodName of foodOrder) {
    const food = inventory.find(i => i.item === foodName);
    if (food && food.qty > 0) {
      const stats = FOOD_ITEMS[foodName];
      const newHp = Math.min(100, agent.hp + stats.hp);
      const newEnergy = Math.min(100, agent.energy + stats.energy);
      db.prepare("UPDATE agents SET hp = ?, energy = ? WHERE id = ?").run(newHp, newEnergy, agent.id);
      db.prepare("UPDATE items SET qty = qty - 1 WHERE agent_id = ? AND item = ?").run(agent.id, foodName);
      db.prepare("DELETE FROM items WHERE agent_id = ? AND item = ? AND qty <= 0").run(agent.id, foodName);
      ate = true;
      break;
    }
  }

  if (!ate) {
    const newHp = Math.max(0, agent.hp - 1);
    db.prepare("UPDATE agents SET hp = ? WHERE id = ?").run(newHp, agent.id);
    if (newHp <= 0) {
      db.prepare("UPDATE agents SET status = 'dead', busy_action = NULL, busy_ticks_remaining = 0, busy_data = NULL WHERE id = ?").run(agent.id);
      db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'death', ?, ?)").run(
        tick, agent.id, JSON.stringify({ cause: 'starvation' })
      );
    }
  }
}

function respawnResources(db) {
  db.prepare(`
    UPDATE tiles SET resource_qty = CASE
      WHEN type = 'forest' AND resource = 'wood' THEN 3
      WHEN type = 'forest' AND resource = 'berries' THEN 2
      WHEN type = 'rock' THEN 3
      WHEN type = 'fertile_soil' THEN 2
      WHEN type = 'water' THEN 2
      WHEN type = 'mountain' THEN 5
      ELSE resource_qty
    END
    WHERE resource IS NOT NULL AND resource_qty <= 0
  `).run();
}

export function startGameLoop(db, io, { setTickFn, broadcastTickFn }, tickInterval = 1500) {
  let tick = 0;
  return setInterval(() => {
    tick++;
    if (setTickFn) setTickFn(tick);
    processTick(db, tick);
    if (broadcastTickFn) broadcastTickFn(io, db, tick);
  }, tickInterval);
}
