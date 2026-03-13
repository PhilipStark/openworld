import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from '../src/db.js';

describe('db', () => {
  let db;

  beforeEach(() => { db = createDb(':memory:'); });
  afterEach(() => { db.close(); });

  it('creates all tables on init', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);
    expect(tables).toContain('agents');
    expect(tables).toContain('tiles');
    expect(tables).toContain('structures');
    expect(tables).toContain('events');
    expect(tables).toContain('items');
    expect(tables).toContain('trades');
  });
});
