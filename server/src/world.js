import { createNoise2D } from 'simplex-noise';

const TILE_RESOURCES = {
  forest: () => Math.random() > 0.5 ? { resource: 'wood', qty: 3 } : { resource: 'berries', qty: 2 },
  rock: () => ({ resource: 'stone', qty: 3 }),
  fertile_soil: () => ({ resource: 'wheat', qty: 2 }),
  grass: () => Math.random() > 0.8 ? { resource: 'grass', qty: 3 } : { resource: null, qty: 0 },
  water: () => ({ resource: 'fish', qty: 2 }),
  sand: () => ({ resource: null, qty: 0 }),
  mountain: () => ({ resource: 'stone', qty: 5 }),
  plaza: () => ({ resource: null, qty: 0 }),
  path: () => ({ resource: null, qty: 0 }),
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

/**
 * Generate a world with distinct biomes and a central town.
 * Resources are regionalized by quadrant to encourage trade and movement.
 * NE = forest (wood, berries), SE = rock (stone), SW = water (fish), NW = farmland (wheat)
 */
export function generateWorld(db, width, height, seed) {
  const noise2D = createNoise2D(seed ? () => seed : undefined);

  const insert = db.prepare(
    'INSERT OR IGNORE INTO tiles (x, y, type, resource, resource_qty) VALUES (?, ?, ?, ?, ?)'
  );

  const batch = db.transaction((tiles) => {
    for (const t of tiles) insert.run(t.x, t.y, t.type, t.resource, t.qty);
  });

  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const tiles = [];

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distFromCenter = Math.sqrt(dx * dx + dy * dy);

      let type;

      // Town center plaza (radius 3)
      if (distFromCenter <= 3) {
        type = 'plaza';
      }
      // Paths radiating from center (cardinal directions, 1 tile wide)
      else if (distFromCenter <= width * 0.4 && (Math.abs(dx) === 0 || Math.abs(dy) === 0) && distFromCenter > 3) {
        type = 'path';
      }
      // Natural terrain with quadrant bias for resource regionalization
      else {
        const elevation = noise2D(x / 15, y / 15);
        const moisture = noise2D((x + 1000) / 12, (y + 1000) / 12);
        const angle = Math.atan2(dy, dx);
        const quadrant = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 4) % 4;
        // Bias: 0=forest, 1=rocky, 2=watery, 3=farmland
        const elevBias = [0.15, 0.25, -0.15, -0.1][quadrant];
        const moistBias = [0.2, -0.1, -0.2, 0.15][quadrant];
        type = noiseToTileType(elevation + elevBias, moisture + moistBias);
      }

      const res = TILE_RESOURCES[type]();
      tiles.push({ x, y, type, resource: res.resource, qty: res.qty });
    }
  }

  batch(tiles);

  // Place town infrastructure at center (no owner = public)
  const insertStruct = db.prepare(
    "INSERT OR IGNORE INTO structures (id, x, y, type, owner_id, text, created_at_tick) VALUES (?, ?, ?, ?, NULL, ?, 0)"
  );
  const townStructures = [
    { x: centerX, y: centerY, type: 'crafting_table', text: null },
    { x: centerX + 1, y: centerY, type: 'sign', text: 'Town Center - All agents welcome' },
    { x: centerX - 1, y: centerY, type: 'sign', text: 'Trade here! Leave signs with offers' },
    { x: centerX, y: centerY - 1, type: 'shelter', text: null },
    { x: centerX, y: centerY + 1, type: 'shelter', text: null },
  ];
  for (const s of townStructures) {
    insertStruct.run('town_' + Math.random().toString(36).slice(2, 8), s.x, s.y, s.type, s.text);
  }
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
