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

    CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick);
    CREATE INDEX IF NOT EXISTS idx_events_agent_type ON events(agent_id, type);
    CREATE INDEX IF NOT EXISTS idx_structures_pos ON structures(x, y);
    CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
    CREATE INDEX IF NOT EXISTS idx_trades_status_expires ON trades(status, expires_tick);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
  `);

  return db;
}
