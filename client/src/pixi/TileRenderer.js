/**
 * TileRenderer — Sprite-based tile rendering with pixel art textures
 * Replaces solid colored rectangles with procedural Tibia-style sprites
 */
import { Container, Sprite } from 'pixi.js';
import { getTileTexture, TILE_SIZE } from './SpriteGenerator.js';

export { TILE_SIZE };

// Water animation frame counter
let waterFrame = 0;
let waterTimer = 0;
const WATER_ANIM_INTERVAL = 800; // ms between water animation frames

/**
 * Create a tile container with sprite-based tiles
 * Returns a Container (not Graphics) for proper sprite rendering
 */
export function createTileLayer(tiles) {
  const container = new Container();
  container.label = 'tileLayer';

  for (const tile of tiles) {
    const texture = getTileTexture(tile.type, tile.x, tile.y, 0);
    const sprite = new Sprite(texture);
    sprite.x = tile.x * TILE_SIZE;
    sprite.y = tile.y * TILE_SIZE;
    sprite.width = TILE_SIZE;
    sprite.height = TILE_SIZE;
    sprite.tileType = tile.type;
    sprite.tileX = tile.x;
    sprite.tileY = tile.y;
    container.addChild(sprite);
  }

  return container;
}

/**
 * Update water tile animations
 * Call this from the render loop with delta time
 */
export function updateWaterAnimation(tileContainer, dt) {
  waterTimer += dt;
  if (waterTimer < WATER_ANIM_INTERVAL) return;
  waterTimer = 0;
  waterFrame = (waterFrame + 1) % 4;

  if (!tileContainer) return;
  for (const child of tileContainer.children) {
    if (child.tileType === 'water') {
      child.texture = getTileTexture('water', child.tileX, child.tileY, waterFrame);
    }
  }
}

// Legacy compat — drawTiles using sprites
export function drawTiles(container, tiles) {
  // Remove old children
  container.removeChildren();

  for (const tile of tiles) {
    const texture = getTileTexture(tile.type, tile.x, tile.y, 0);
    const sprite = new Sprite(texture);
    sprite.x = tile.x * TILE_SIZE;
    sprite.y = tile.y * TILE_SIZE;
    sprite.width = TILE_SIZE;
    sprite.height = TILE_SIZE;
    sprite.tileType = tile.type;
    sprite.tileX = tile.x;
    sprite.tileY = tile.y;
    container.addChild(sprite);
  }
}
