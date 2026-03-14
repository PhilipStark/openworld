import { createNoise2D } from 'simplex-noise';

const TILE_RESOURCES = {
  forest: () => Math.random() > 0.5 ? { resource: 'wood', qty: 3 } : { resource: 'berries', qty: 2 },
  rock: () => ({ resource: 'stone', qty: 3 }),
  fertile_soil: () => ({ resource: 'wheat', qty: 2 }),
  grass: () => Math.random() > 0.8 ? { resource: 'grass', qty: 3 } : { resource: null, qty: 0 },
  water: () => ({ resource: 'fish', qty: 2 }),
  sand: () => ({ resource: null, qty: 0 }),
  mountain: () => ({ resource: 'stone', qty: 5 }),
};

function noiseToTileType(elevation, moisture) {
  if (elevation < -0.3) return 'water';
  if (elevation < -0.1) return 'sand';
  if (elevation > 0.6) return 'mountain';
  if (elevation > 0.4) return 'rock';
  if (moisture > 0.3) return 'forest';
  if (moisture > 0.0) return 'fertile_soil';
  return 'grass';
}

export function generateWorld(db, width, height, seed) {
  const noise2D = createNoise2D(seed ? () => seed : undefined);

  const insert = db.prepare(
    'INSERT OR IGNORE INTO tiles (x, y, type, resource, resource_qty) VALUES (?, ?, ?, ?, ?)'
  );

  const batch = db.transaction((tiles) => {
    for (const t of tiles) insert.run(t.x, t.y, t.type, t.resource, t.qty);
  });

  const tiles = [];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const elevation = noise2D(x / 20, y / 20);
      const moisture = noise2D((x + 1000) / 15, (y + 1000) / 15);
      const type = noiseToTileType(elevation, moisture);
      const res = TILE_RESOURCES[type]();
      tiles.push({ x, y, type, resource: res.resource, qty: res.qty });
    }
  }

  batch(tiles);
}

export function getTile(db, x, y) {
  return db.prepare('SELECT * FROM tiles WHERE x = ? AND y = ?').get(x, y) || null;
}

export function getWorldSize(db) {
  const row = db.prepare('SELECT MAX(x) + 1 as width, MAX(y) + 1 as height FROM tiles').get();
  return { width: row.width || 0, height: row.height || 0 };
}

export function expandWorld(db, amount) {
  const { width, height } = getWorldSize(db);
  const newWidth = width + amount;
  const newHeight = height + amount;
  // Use deterministic seed based on world size so expansion is continuous
  const seedValue = width * 10000 + height;
  const noise2D = createNoise2D(() => seedValue / 100000);

  const insert = db.prepare(
    'INSERT OR IGNORE INTO tiles (x, y, type, resource, resource_qty) VALUES (?, ?, ?, ?, ?)'
  );

  const batch = db.transaction((tiles) => {
    for (const t of tiles) insert.run(t.x, t.y, t.type, t.resource, t.qty);
  });

  const tiles = [];
  for (let x = 0; x < newWidth; x++) {
    for (let y = 0; y < newHeight; y++) {
      if (x < width && y < height) continue; // skip existing
      const elevation = noise2D(x / 20, y / 20);
      const moisture = noise2D((x + 1000) / 15, (y + 1000) / 15);
      const type = noiseToTileType(elevation, moisture);
      const res = TILE_RESOURCES[type]();
      tiles.push({ x, y, type, resource: res.resource, qty: res.qty });
    }
  }

  batch(tiles);
}

export function shouldExpand(db, agentCount) {
  const { width, height } = getWorldSize(db);
  const totalTiles = width * height;
  return agentCount > totalTiles / 100;
}
