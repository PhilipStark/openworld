/**
 * SpriteGenerator — Procedural pixel art sprite generation (Tibia-style)
 * Generates all game textures at runtime via Canvas 2D → Pixi.js Textures
 */
import { Texture } from 'pixi.js';

const TILE = 32;
const CHAR = 32; // character sprite size

// ─── Utility ───────────────────────────────────────────────────────
function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function colorVariant(base, rng, range = 15) {
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  const dr = Math.floor((rng() - 0.5) * range * 2);
  const dg = Math.floor((rng() - 0.5) * range * 2);
  const db = Math.floor((rng() - 0.5) * range * 2);
  return `rgb(${clamp(r+dr)},${clamp(g+dg)},${clamp(b+db)})`;
}

function clamp(v, min=0, max=255) { return Math.max(min, Math.min(max, v)); }

// ─── TILE GENERATORS ───────────────────────────────────────────────

function generateGrass(ctx, rng) {
  // Base green fill
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      ctx.fillStyle = colorVariant('#5a9e3e', rng, 12);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Grass blade details
  for (let i = 0; i < 18; i++) {
    const gx = Math.floor(rng() * TILE);
    const gy = Math.floor(rng() * TILE);
    const h = 2 + Math.floor(rng() * 3);
    ctx.fillStyle = colorVariant('#6ebb4a', rng, 20);
    ctx.fillRect(gx, gy - h, 1, h);
    if (rng() > 0.5) ctx.fillRect(gx + 1, gy - h + 1, 1, 1);
  }
  // Occasional tiny flowers
  if (rng() > 0.7) {
    const fx = Math.floor(rng() * (TILE - 4)) + 2;
    const fy = Math.floor(rng() * (TILE - 4)) + 2;
    const colors = ['#f5e642', '#ff6b9d', '#ffffff', '#c084fc'];
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.fillRect(fx, fy, 2, 2);
    ctx.fillStyle = '#4a7c2e';
    ctx.fillRect(fx, fy + 2, 1, 2);
  }
}

function generateWater(ctx, rng, frame = 0) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const wave = Math.sin((x + frame * 4) * 0.3) * 4 + Math.sin((y + frame * 2) * 0.25) * 3;
      const base = 60 + wave;
      const r = clamp(30 + Math.floor(rng() * 10));
      const g = clamp(base + 60 + Math.floor(rng() * 15));
      const b = clamp(base + 150 + Math.floor(rng() * 20));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Specular highlights
  for (let i = 0; i < 4; i++) {
    const wx = Math.floor(rng() * (TILE - 6)) + 3;
    const wy = Math.floor(rng() * (TILE - 2));
    ctx.fillStyle = 'rgba(180, 220, 255, 0.4)';
    ctx.fillRect(wx, wy, 3 + Math.floor(rng() * 4), 1);
  }
}

function generateForest(ctx, rng) {
  // Dark ground base
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      ctx.fillStyle = colorVariant('#3a5e2a', rng, 8);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Tree trunk center
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(13, 18, 6, 14);
  ctx.fillStyle = '#4a3118';
  ctx.fillRect(14, 18, 2, 14);
  // Tree canopy (big round top)
  const greens = ['#2d6e1e', '#348a22', '#27591a', '#3a9928'];
  for (let dy = -2; dy < 10; dy++) {
    for (let dx = -6; dx < 7; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 8 + rng() * 2) {
        ctx.fillStyle = greens[Math.floor(rng() * greens.length)];
        ctx.fillRect(16 + dx, 10 + dy, 2, 2);
      }
    }
  }
  // Highlight leaves
  for (let i = 0; i < 6; i++) {
    const lx = 8 + Math.floor(rng() * 16);
    const ly = 4 + Math.floor(rng() * 12);
    ctx.fillStyle = '#4cc830';
    ctx.fillRect(lx, ly, 1, 1);
  }
}

function generateRock(ctx, rng) {
  // Base stone
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      ctx.fillStyle = colorVariant('#7a7a7a', rng, 10);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Stone surface detail (larger patches)
  for (let i = 0; i < 5; i++) {
    const sx = Math.floor(rng() * (TILE - 8));
    const sy = Math.floor(rng() * (TILE - 6));
    const sw = 4 + Math.floor(rng() * 8);
    const sh = 3 + Math.floor(rng() * 5);
    ctx.fillStyle = colorVariant('#8a8a8a', rng, 15);
    ctx.fillRect(sx, sy, sw, sh);
    // Dark edge
    ctx.fillStyle = colorVariant('#606060', rng, 8);
    ctx.fillRect(sx, sy + sh - 1, sw, 1);
    ctx.fillRect(sx + sw - 1, sy, 1, sh);
  }
  // Cracks
  for (let i = 0; i < 3; i++) {
    let cx = Math.floor(rng() * TILE);
    let cy = Math.floor(rng() * TILE);
    ctx.fillStyle = '#505050';
    for (let j = 0; j < 6; j++) {
      ctx.fillRect(cx, cy, 1, 1);
      cx += Math.floor(rng() * 3) - 1;
      cy += 1;
    }
  }
}

function generateSand(ctx, rng) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      ctx.fillStyle = colorVariant('#d4b84a', rng, 12);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Sand ripples
  for (let i = 0; i < 5; i++) {
    const ry = 4 + Math.floor(rng() * (TILE - 8));
    ctx.fillStyle = 'rgba(200, 170, 60, 0.5)';
    const rx = Math.floor(rng() * 8);
    ctx.fillRect(rx, ry, TILE - rx * 2 + Math.floor(rng() * 6), 1);
  }
  // Occasional pebbles
  for (let i = 0; i < 3; i++) {
    if (rng() > 0.5) {
      const px = Math.floor(rng() * (TILE - 2));
      const py = Math.floor(rng() * (TILE - 2));
      ctx.fillStyle = colorVariant('#a09050', rng, 20);
      ctx.fillRect(px, py, 2, 1);
    }
  }
}

function generateMountain(ctx, rng) {
  // Dark base
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      ctx.fillStyle = colorVariant('#5a4a3a', rng, 8);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Mountain peak shape
  const peakColors = ['#7a6a52', '#8a7a62', '#6a5a42'];
  for (let y = 0; y < TILE; y++) {
    const halfWidth = Math.floor((TILE / 2) * (1 - y / TILE) * 0.9) + 4;
    const startX = TILE / 2 - halfWidth;
    for (let x = startX; x < startX + halfWidth * 2; x++) {
      if (x >= 0 && x < TILE) {
        ctx.fillStyle = peakColors[Math.floor(rng() * peakColors.length)];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  // Snow cap on top
  for (let y = 0; y < 8; y++) {
    const halfWidth = Math.floor(6 * (1 - y / 8)) + 1;
    const startX = TILE / 2 - halfWidth;
    for (let x = startX; x < startX + halfWidth * 2; x++) {
      if (x >= 0 && x < TILE && rng() > 0.2) {
        ctx.fillStyle = colorVariant('#e8e8f0', rng, 8);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  // Rocky texture
  for (let i = 0; i < 8; i++) {
    const rx = Math.floor(rng() * TILE);
    const ry = 8 + Math.floor(rng() * (TILE - 10));
    ctx.fillStyle = '#3a3020';
    ctx.fillRect(rx, ry, 1 + Math.floor(rng() * 2), 1);
  }
}

function generateFertileSoil(ctx, rng) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      ctx.fillStyle = colorVariant('#6b4226', rng, 10);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Tilled rows
  for (let row = 0; row < 4; row++) {
    const ry = 4 + row * 8;
    ctx.fillStyle = '#553520';
    ctx.fillRect(2, ry, TILE - 4, 2);
    ctx.fillStyle = '#7a5236';
    ctx.fillRect(2, ry - 1, TILE - 4, 1);
  }
  // Tiny sprouts
  for (let i = 0; i < 5; i++) {
    const sx = 4 + Math.floor(rng() * (TILE - 8));
    const sy = Math.floor(rng() * TILE);
    ctx.fillStyle = '#5aa832';
    ctx.fillRect(sx, sy - 2, 1, 3);
    ctx.fillRect(sx - 1, sy - 3, 1, 1);
    ctx.fillRect(sx + 1, sy - 3, 1, 1);
  }
}

// ─── CHARACTER SPRITE GENERATOR ────────────────────────────────────

const SKIN_TONES = ['#f5d0a9', '#d4a574', '#8d5524', '#c68642', '#e0ac69'];
const HAIR_COLORS = ['#2c1810', '#8b4513', '#daa520', '#c0392b', '#f5f5f5', '#1a1a2e'];
const SHIRT_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];

function generateCharacter(ctx, rng, direction = 0, walkFrame = 0, options = {}) {
  const skinColor = options.skin || SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)];
  const hairColor = options.hair || HAIR_COLORS[Math.floor(rng() * HAIR_COLORS.length)];
  const shirtColor = options.shirt || SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)];
  const pantsColor = options.pants || '#2c3e50';

  // Walk animation leg offset
  const legOffset = walkFrame === 1 ? 1 : walkFrame === 3 ? -1 : 0;

  // direction: 0=down, 1=left, 2=up, 3=right
  const facingDown = direction === 0;
  const facingUp = direction === 2;
  const facingSide = direction === 1 || direction === 3;
  const flipX = direction === 3;

  ctx.save();
  if (flipX) {
    ctx.translate(CHAR, 0);
    ctx.scale(-1, 1);
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(16, 30, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs (pants)
  ctx.fillStyle = pantsColor;
  ctx.fillRect(11 + legOffset, 22, 4, 7);
  ctx.fillRect(17 - legOffset, 22, 4, 7);

  // Boots
  ctx.fillStyle = '#3d2817';
  ctx.fillRect(10 + legOffset, 28, 5, 3);
  ctx.fillRect(16 - legOffset, 28, 6, 3);

  // Body (shirt)
  ctx.fillStyle = shirtColor;
  ctx.fillRect(10, 14, 12, 9);
  // Shirt shading
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(10, 14, 2, 9);
  ctx.fillRect(20, 14, 2, 9);

  // Arms
  ctx.fillStyle = shirtColor;
  if (facingSide) {
    ctx.fillRect(8, 14, 3, 7);
  } else {
    ctx.fillRect(7, 14, 3, 7 + legOffset);
    ctx.fillRect(22, 14, 3, 7 - legOffset);
  }
  // Hands (skin)
  ctx.fillStyle = skinColor;
  ctx.fillRect(7, 20 + legOffset, 3, 2);
  if (!facingSide) ctx.fillRect(22, 20 - legOffset, 3, 2);

  // Head
  ctx.fillStyle = skinColor;
  ctx.fillRect(11, 5, 10, 10);

  // Hair
  ctx.fillStyle = hairColor;
  if (facingDown || facingSide) {
    ctx.fillRect(10, 3, 12, 4);  // top
    ctx.fillRect(10, 3, 2, 8);   // left side
    ctx.fillRect(20, 3, 2, 8);   // right side
  }
  if (facingUp) {
    ctx.fillRect(10, 3, 12, 12); // full back of head
  }

  // Face (only if facing down or side)
  if (facingDown) {
    // Eyes
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(13, 8, 2, 2);
    ctx.fillRect(17, 8, 2, 2);
    // Eye highlights
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(13, 8, 1, 1);
    ctx.fillRect(17, 8, 1, 1);
    // Mouth
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(14, 12, 4, 1);
  } else if (facingSide) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(14, 8, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(14, 8, 1, 1);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(13, 12, 3, 1);
  }

  ctx.restore();
}

// ─── STRUCTURE GENERATORS ──────────────────────────────────────────

function generateShelter(ctx, rng) {
  // Wooden house base
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(2, 10, 28, 20);
  // Wall planks
  for (let y = 10; y < 30; y += 4) {
    ctx.fillStyle = '#7a5c12';
    ctx.fillRect(2, y, 28, 1);
  }
  // Roof
  ctx.fillStyle = '#a0522d';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(2 - i, 10 - i, 28 + i * 2, 2);
  }
  ctx.fillStyle = '#8b4513';
  for (let i = 0; i < 8; i += 2) {
    ctx.fillRect(2 - i, 10 - i, 28 + i * 2, 1);
  }
  // Door
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(12, 18, 8, 12);
  ctx.fillStyle = '#daa520';
  ctx.fillRect(18, 23, 2, 2);
  // Window
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(4, 14, 6, 5);
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(6, 14, 2, 5);
  ctx.fillRect(4, 16, 6, 1);
}

function generateStorage(ctx, rng) {
  // Chest base
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(4, 12, 24, 16);
  // Chest lid
  ctx.fillStyle = '#a07818';
  ctx.fillRect(3, 8, 26, 6);
  ctx.fillRect(4, 6, 24, 4);
  // Metal bands
  ctx.fillStyle = '#808080';
  ctx.fillRect(4, 10, 24, 2);
  ctx.fillRect(4, 22, 24, 2);
  // Lock
  ctx.fillStyle = '#daa520';
  ctx.fillRect(14, 12, 4, 4);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(15, 13, 2, 2);
  // Shading
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(4, 14, 24, 14);
}

function generateCraftingTable(ctx, rng) {
  // Table top
  ctx.fillStyle = '#c4952a';
  ctx.fillRect(2, 8, 28, 4);
  ctx.fillStyle = '#b08425';
  ctx.fillRect(2, 12, 28, 2);
  // Grid lines on top
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(2, 8, 28, 1);
  for (let x = 2; x < 30; x += 7) {
    ctx.fillRect(x, 8, 1, 4);
  }
  // Legs
  ctx.fillStyle = '#6b4912';
  ctx.fillRect(4, 14, 4, 16);
  ctx.fillRect(24, 14, 4, 16);
  // Tools on table
  ctx.fillStyle = '#808080';
  ctx.fillRect(10, 6, 2, 6);
  ctx.fillRect(8, 5, 6, 2);
  ctx.fillStyle = '#a0522d';
  ctx.fillRect(18, 7, 6, 2);
  ctx.fillRect(20, 5, 2, 6);
}

function generateWall(ctx, rng) {
  // Stone wall
  for (let y = 0; y < TILE; y += 6) {
    const offset = (y / 6) % 2 === 0 ? 0 : 8;
    for (let x = -8; x < TILE + 8; x += 16) {
      ctx.fillStyle = colorVariant('#808080', rng, 15);
      ctx.fillRect(x + offset, y, 15, 5);
      ctx.fillStyle = '#606060';
      ctx.fillRect(x + offset, y + 5, 15, 1);
      ctx.fillRect(x + offset + 15, y, 1, 6);
    }
  }
  // Mortar lines
  ctx.fillStyle = '#a0a0a0';
  for (let y = 5; y < TILE; y += 6) {
    ctx.fillRect(0, y, TILE, 1);
  }
}

function generateBridge(ctx, rng) {
  // Water base
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      ctx.fillStyle = colorVariant('#3a7abd', rng, 8);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Wooden planks
  for (let x = 0; x < TILE; x += 5) {
    ctx.fillStyle = colorVariant('#a07830', rng, 10);
    ctx.fillRect(x, 4, 4, 24);
    ctx.fillStyle = '#7a5820';
    ctx.fillRect(x, 4, 4, 1);
    ctx.fillRect(x, 27, 4, 1);
  }
  // Railings
  ctx.fillStyle = '#6b4912';
  ctx.fillRect(0, 2, TILE, 3);
  ctx.fillRect(0, 27, TILE, 3);
}

function generateDoor(ctx, rng) {
  // Door frame
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(6, 0, 20, TILE);
  // Door panels
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(8, 2, 16, TILE - 4);
  // Panel detail
  ctx.fillStyle = '#7a5c12';
  ctx.fillRect(8, 2, 16, 1);
  ctx.fillRect(8, TILE / 2, 16, 1);
  // Handle
  ctx.fillStyle = '#daa520';
  ctx.fillRect(20, 14, 3, 4);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(21, 15, 1, 2);
  // Arch top
  ctx.fillStyle = '#4a2d12';
  ctx.fillRect(6, 0, 20, 2);
}

function generateSign(ctx, rng) {
  // Post
  ctx.fillStyle = '#6b4912';
  ctx.fillRect(14, 16, 4, 16);
  // Sign board
  ctx.fillStyle = '#c4952a';
  ctx.fillRect(4, 4, 24, 14);
  ctx.fillStyle = '#a07818';
  ctx.fillRect(4, 4, 24, 2);
  ctx.fillRect(4, 16, 24, 2);
  ctx.fillRect(4, 4, 2, 14);
  ctx.fillRect(26, 4, 2, 14);
  // Text lines
  ctx.fillStyle = '#3d2817';
  ctx.fillRect(8, 8, 16, 2);
  ctx.fillRect(10, 12, 12, 2);
}

// ─── TEXTURE CACHE & PUBLIC API ────────────────────────────────────

const textureCache = new Map();

function generateTexture(generator, seed, ...args) {
  const key = `${generator.name}_${seed}_${args.join('_')}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const canvas = createCanvas(TILE, TILE);
  const ctx = canvas.getContext('2d');
  const rng = seededRandom(seed);
  generator(ctx, rng, ...args);
  const texture = Texture.from(canvas);
  textureCache.set(key, texture);
  return texture;
}

function generateCharTexture(seed, direction, walkFrame) {
  const key = `char_${seed}_${direction}_${walkFrame}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const canvas = createCanvas(CHAR, CHAR);
  const ctx = canvas.getContext('2d');
  const rng = seededRandom(seed);
  // Pre-roll rng to pick consistent colors for this seed
  const skin = SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)];
  const hair = HAIR_COLORS[Math.floor(rng() * HAIR_COLORS.length)];
  const shirt = SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)];
  const pants = ['#2c3e50', '#1a1a2e', '#4a4a2e', '#2e1a1a'][Math.floor(rng() * 4)];

  const rng2 = seededRandom(seed + direction * 100 + walkFrame * 1000);
  generateCharacter(ctx, rng2, direction, walkFrame, { skin, hair, shirt, pants });
  const texture = Texture.from(canvas);
  textureCache.set(key, texture);
  return texture;
}

// ─── Plaza & Path tiles ──────────────────────────────────────────

function generatePlaza(ctx, rng) {
  // Cobblestone plaza — warm stone tiles
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      ctx.fillStyle = colorVariant('#b8a88a', rng, 10);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Stone tile grid lines
  ctx.fillStyle = 'rgba(90,75,55,0.4)';
  for (let i = 0; i < TILE; i += 8) {
    ctx.fillRect(0, i, TILE, 1);
    ctx.fillRect(i, 0, 1, TILE);
  }
  // Occasional darker cobblestone accent
  for (let i = 0; i < 4; i++) {
    const px = Math.floor(rng() * 4) * 8 + 2;
    const py = Math.floor(rng() * 4) * 8 + 2;
    ctx.fillStyle = colorVariant('#9a8a6a', rng, 8);
    ctx.fillRect(px, py, 4, 4);
  }
}

function generatePath(ctx, rng) {
  // Dirt path — lighter brown, flat
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      ctx.fillStyle = colorVariant('#c4a56e', rng, 8);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Small pebbles
  for (let i = 0; i < 6; i++) {
    const px = Math.floor(rng() * (TILE - 2));
    const py = Math.floor(rng() * (TILE - 2));
    ctx.fillStyle = colorVariant('#a89060', rng, 10);
    ctx.fillRect(px, py, 2, 2);
  }
}

// ─── TILE TEXTURES (with variation seeds per position) ─────────────

const TILE_GENERATORS = {
  grass: generateGrass,
  water: generateWater,
  forest: generateForest,
  rock: generateRock,
  sand: generateSand,
  mountain: generateMountain,
  fertile_soil: generateFertileSoil,
  plaza: generatePlaza,
  path: generatePath,
};

export function getTileTexture(type, x, y, frame = 0) {
  const seed = x * 7919 + y * 6271 + frame * 97;
  const gen = TILE_GENERATORS[type] || generateGrass;
  return generateTexture(gen, seed, ...(type === 'water' ? [frame] : []));
}

const STRUCTURE_GENERATORS = {
  shelter: generateShelter,
  storage: generateStorage,
  crafting_table: generateCraftingTable,
  bridge: generateBridge,
  wall: generateWall,
  door: generateDoor,
  sign: generateSign,
};

export function getStructureTexture(type) {
  const gen = STRUCTURE_GENERATORS[type];
  if (!gen) return generateTexture(generateSign, 42);
  return generateTexture(gen, type.charCodeAt(0) * 31 + type.length);
}

export function getCharacterTexture(agentId, direction, walkFrame) {
  let seed = 0;
  for (let i = 0; i < agentId.length; i++) {
    seed = ((seed << 5) - seed) + agentId.charCodeAt(i);
    seed |= 0;
  }
  return generateCharTexture(Math.abs(seed), direction, walkFrame);
}

// Preload common textures to avoid first-frame stutter
export function preloadTextures() {
  Object.keys(TILE_GENERATORS).forEach(type => {
    getTileTexture(type, 0, 0, 0);
  });
  Object.keys(STRUCTURE_GENERATORS).forEach(type => {
    getStructureTexture(type);
  });
}

export { TILE as TILE_SIZE };
