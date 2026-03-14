import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb } from '../src/db.js';
import { generateWorld, getTile, getWorldSize, expandWorld } from '../src/world.js';

describe('world', () => {
  let db;

  beforeEach(() => { db = createDb(':memory:'); });
  afterEach(() => { db.close(); });

  it('generates a 50x50 grid', () => {
    generateWorld(db, 50, 50);
    const size = getWorldSize(db);
    expect(size.width).toBe(50);
    expect(size.height).toBe(50);
  });

  it('every tile has a valid type', () => {
    generateWorld(db, 10, 10);
    const validTypes = ['grass', 'water', 'rock', 'sand', 'forest', 'mountain', 'fertile_soil', 'plaza', 'path'];
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const tile = getTile(db, x, y);
        expect(tile).not.toBeNull();
        expect(validTypes).toContain(tile.type);
      }
    }
  });

  it('tiles with resources have correct resource type', () => {
    generateWorld(db, 20, 20);
    const forests = db.prepare("SELECT * FROM tiles WHERE type = 'forest'").all();
    for (const t of forests) {
      expect(['wood', 'berries']).toContain(t.resource);
      expect(t.resource_qty).toBeGreaterThan(0);
    }
  });

  it('expands world by 25x25', () => {
    generateWorld(db, 50, 50);
    expandWorld(db, 25);
    const size = getWorldSize(db);
    expect(size.width).toBe(75);
    expect(size.height).toBe(75);
  });
});
