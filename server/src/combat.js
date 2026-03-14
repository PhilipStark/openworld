export function handleAttack(db, agent, params, tick) {
  const targetId = params?.agent_id;
  if (!targetId) return { ok: false, error: 'invalid_params', message: 'Need agent_id' };

  const target = db.prepare("SELECT * FROM agents WHERE id = ? OR name = ?").get(targetId, targetId);
  if (!target) return { ok: false, error: 'target_not_found', message: 'Target not found' };
  if (target.id === agent.id) return { ok: false, error: 'self_target', message: 'Cannot attack yourself' };
  if (target.status === 'dead') return { ok: false, error: 'target_dead', message: 'Cannot attack dead agent' };

  const dist = Math.abs(agent.x - target.x) + Math.abs(agent.y - target.y);
  if (dist > 1) return { ok: false, error: 'not_adjacent', message: 'Must be adjacent to attack' };

  let baseDmg = 15 + Math.floor(Math.random() * 11); // 15-25
  if (agent.weapon === 'sword') baseDmg += 10;
  if (target.shield === 'shield') baseDmg = Math.max(0, baseDmg - 5);

  const newHp = Math.max(0, target.hp - baseDmg);
  db.prepare("UPDATE agents SET hp = ? WHERE id = ?").run(newHp, target.id);

  // Interrupt busy action
  if (target.busy_action) {
    db.prepare("UPDATE agents SET busy_action = NULL, busy_ticks_remaining = 0, busy_data = NULL WHERE id = ?").run(target.id);
  }

  // Log event
  db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'attack', ?, ?)").run(
    tick, agent.id, JSON.stringify({ target_id: target.id, damage: baseDmg, target_hp: newHp })
  );

  // Check death
  if (newHp <= 0) {
    killAgent(db, target.id, tick);
  }

  return { ok: true, tick, result: { damage: baseDmg, target_hp: newHp, killed: newHp <= 0 } };
}

export function handleSteal(db, agent, params, tick) {
  const targetId = params?.agent_id;
  if (!targetId) return { ok: false, error: 'invalid_params', message: 'Need agent_id' };

  const target = db.prepare("SELECT * FROM agents WHERE id = ? OR name = ?").get(targetId, targetId);
  if (!target) return { ok: false, error: 'target_not_found', message: 'Target not found' };
  if (target.id === agent.id) return { ok: false, error: 'self_target', message: 'Cannot steal from yourself' };
  if (target.status === 'dead') return { ok: false, error: 'target_dead', message: 'Cannot steal from dead agent (use loot)' };

  const dist = Math.abs(agent.x - target.x) + Math.abs(agent.y - target.y);
  if (dist > 1) return { ok: false, error: 'not_adjacent', message: 'Must be adjacent to steal' };

  // 50% chance to fail
  if (Math.random() < 0.5) {
    db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'steal_failed', ?, ?)").run(
      tick, agent.id, JSON.stringify({ target_id: target.id })
    );
    db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'steal_attempt_detected', ?, ?)").run(
      tick, target.id, JSON.stringify({ thief_id: agent.id })
    );
    return { ok: true, tick, result: { stolen: false, caught: true } };
  }

  const targetItems = db.prepare("SELECT item, qty FROM items WHERE agent_id = ?").all(target.id);
  if (targetItems.length === 0) return { ok: true, tick, result: { stolen: false, nothing_to_steal: true } };

  const stolen = targetItems[Math.floor(Math.random() * targetItems.length)];
  const stolenQty = 1;

  // Check inventory capacity before stealing
  const existing = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agent.id, stolen.item);
  if (!existing) {
    const invCount = db.prepare("SELECT COUNT(*) as cnt FROM items WHERE agent_id = ?").get(agent.id).cnt;
    if (invCount >= 20) return { ok: true, tick, result: { stolen: false, inventory_full: true } };
  }

  db.prepare("UPDATE items SET qty = qty - ? WHERE agent_id = ? AND item = ?").run(stolenQty, target.id, stolen.item);
  db.prepare("DELETE FROM items WHERE agent_id = ? AND item = ? AND qty <= 0").run(target.id, stolen.item);

  if (existing) {
    db.prepare("UPDATE items SET qty = qty + ? WHERE agent_id = ? AND item = ?").run(stolenQty, agent.id, stolen.item);
  } else {
    db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, ?, ?)").run(agent.id, stolen.item, stolenQty);
  }

  db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'steal', ?, ?)").run(
    tick, agent.id, JSON.stringify({ target_id: target.id, item: stolen.item, qty: stolenQty })
  );

  return { ok: true, tick, result: { stolen: true, item: stolen.item, qty: stolenQty } };
}

export function handleLoot(db, agent, params, tick) {
  const targetId = params?.agent_id;
  if (!targetId) return { ok: false, error: 'invalid_params', message: 'Need agent_id' };

  const target = db.prepare("SELECT * FROM agents WHERE id = ? OR name = ?").get(targetId, targetId);
  if (!target) return { ok: false, error: 'target_not_found', message: 'Target not found' };
  if (target.status !== 'dead') return { ok: false, error: 'target_alive', message: 'Can only loot dead agents' };

  if (agent.x !== target.x || agent.y !== target.y) {
    return { ok: false, error: 'not_same_tile', message: 'Must be on same tile to loot' };
  }

  const items = db.prepare("SELECT item, qty FROM items WHERE agent_id = ?").all(target.id);
  if (items.length === 0) return { ok: true, tick, result: { looted: [] } };

  // Check inventory capacity before looting
  const currentSlots = db.prepare("SELECT COUNT(*) as cnt FROM items WHERE agent_id = ?").get(agent.id).cnt;
  const MAX_SLOTS = 20;

  const executeLoot = db.transaction(() => {
    const looted = [];
    let usedSlots = currentSlots;

    for (const item of items) {
      const existing = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = ?").get(agent.id, item.item);
      if (existing) {
        db.prepare("UPDATE items SET qty = qty + ? WHERE agent_id = ? AND item = ?").run(item.qty, agent.id, item.item);
        db.prepare("DELETE FROM items WHERE agent_id = ? AND item = ?").run(target.id, item.item);
        looted.push(item);
      } else if (usedSlots < MAX_SLOTS) {
        db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, ?, ?)").run(agent.id, item.item, item.qty);
        db.prepare("DELETE FROM items WHERE agent_id = ? AND item = ?").run(target.id, item.item);
        usedSlots++;
        looted.push(item);
      }
      // Items that don't fit stay on the corpse for other looters
    }
    return looted;
  });
  const looted = executeLoot();

  return { ok: true, tick, result: { looted } };
}

function killAgent(db, agentId, tick) {
  db.prepare("UPDATE agents SET status = 'dead', busy_action = NULL, busy_ticks_remaining = 0, busy_data = NULL WHERE id = ?").run(agentId);
  // Release door ownership so dead agent's doors don't block forever
  db.prepare("UPDATE structures SET owner_id = NULL WHERE owner_id = ? AND type = 'door'").run(agentId);
  db.prepare("INSERT INTO events (tick, type, agent_id, data) VALUES (?, 'death', ?, ?)").run(
    tick, agentId, JSON.stringify({})
  );
}
