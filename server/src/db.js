import Database from 'better-sqlite3';

export function createDb(path = './openworld.db') {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      token TEXT UNIQUE NOT NULL,
      x INTEGER NOT NULL DEFAULT 0,
      y INTEGER NOT NULL DEFAULT 0,
      hp INTEGER NOT NULL DEFAULT 100,
      energy INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'sleeping',
      bio TEXT DEFAULT '',
      weapon TEXT,
      shield TEXT,
      tool TEXT,
      busy_action TEXT,
      busy_ticks_remaining INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tiles (
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      type TEXT NOT NULL,
      resource TEXT,
      resource_qty INTEGER DEFAULT 0,
      respawn_at_tick INTEGER,
      PRIMARY KEY (x, y)
    );

    CREATE TABLE IF NOT EXISTS structures (
      id TEXT PRIMARY KEY,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      type TEXT NOT NULL,
      owner_id TEXT,
      text TEXT,
      hp INTEGER DEFAULT 100,
      created_at_tick INTEGER
    );

    CREATE TABLE IF NOT EXISTS items (
      agent_id TEXT NOT NULL,
      item TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (agent_id, item),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick INTEGER NOT NULL,
      type TEXT NOT NULL,
      agent_id TEXT,
      data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      offer TEXT NOT NULL,
      request TEXT NOT NULL,
      expires_tick INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (from_id) REFERENCES agents(id),
      FOREIGN KEY (to_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS storage_items (
      structure_id TEXT NOT NULL,
      item TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (structure_id, item),
      FOREIGN KEY (structure_id) REFERENCES structures(id)
    );

    CREATE TABLE IF NOT EXISTS agent_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(agent_id, key),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS relationships (
      agent_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      stance TEXT NOT NULL DEFAULT 'neutral',
      note TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agent_id, target_id),
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (target_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS alliances (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      leader_id TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (leader_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS alliance_members (
      alliance_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (alliance_id, agent_id),
      FOREIGN KEY (alliance_id) REFERENCES alliances(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick);
    CREATE INDEX IF NOT EXISTS idx_events_agent_type ON events(agent_id, type);
    CREATE INDEX IF NOT EXISTS idx_structures_pos ON structures(x, y);
    CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
    CREATE INDEX IF NOT EXISTS idx_trades_status_expires ON trades(status, expires_tick);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_tiles_resource ON tiles(x, y, resource_qty) WHERE resource IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
    CREATE INDEX IF NOT EXISTS idx_agents_pos ON agents(x, y) WHERE status = 'awake';
    CREATE INDEX IF NOT EXISTS idx_structures_owner ON structures(owner_id);
    CREATE INDEX IF NOT EXISTS idx_structures_type_pos ON structures(type, x, y);

    -- Bulletin board: persistent public messages at town center
    CREATE TABLE IF NOT EXISTS bulletin_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at_tick INTEGER NOT NULL,
      expires_at_tick INTEGER,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    -- Shops: agents list items for sale with gold prices
    CREATE TABLE IF NOT EXISTS shop_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      structure_id TEXT NOT NULL,
      item TEXT NOT NULL,
      price INTEGER NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (structure_id) REFERENCES structures(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bulletin_active ON bulletin_posts(expires_at_tick);
    CREATE INDEX IF NOT EXISTS idx_shop_listings_struct ON shop_listings(structure_id);
  `);

  // Migration: add busy_data column for reliable action completion
  try {
    db.exec("ALTER TABLE agents ADD COLUMN busy_data TEXT");
  } catch (e) {
    // Column already exists — ignore
  }

  // Migration: add gold column to agents
  try {
    db.exec("ALTER TABLE agents ADD COLUMN gold INTEGER NOT NULL DEFAULT 50");
  } catch (e) {
    // Column already exists — ignore
  }

  // Migration: rename 'planks' to 'plank' for naming consistency
  try {
    const planksRows = db.prepare("SELECT agent_id, qty FROM items WHERE item = 'planks'").all();
    if (planksRows.length > 0) {
      const migrate = db.transaction(() => {
        for (const row of planksRows) {
          const existing = db.prepare("SELECT qty FROM items WHERE agent_id = ? AND item = 'plank'").get(row.agent_id);
          if (existing) {
            db.prepare("UPDATE items SET qty = qty + ? WHERE agent_id = ? AND item = 'plank'").run(row.qty, row.agent_id);
          } else {
            db.prepare("INSERT INTO items (agent_id, item, qty) VALUES (?, 'plank', ?)").run(row.agent_id, row.qty);
          }
        }
        db.prepare("DELETE FROM items WHERE item = 'planks'").run();
      });
      migrate();
    }
  } catch (e) {
    // Migration may fail on fresh DB — ignore
  }

  return db;
}
