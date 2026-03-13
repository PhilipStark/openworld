const TILE_SIZE = 32;

const TILE_COLORS = {
  grass: 0x7ec850,
  water: 0x4a90d9,
  rock: 0x8b8b8b,
  sand: 0xe8d44d,
  forest: 0x2d8a4e,
  mountain: 0x6b5b3e,
  fertile_soil: 0xa0522d,
};

export function drawTiles(graphics, tiles) {
  graphics.clear();
  for (const tile of tiles) {
    const color = TILE_COLORS[tile.type] || 0x333333;
    graphics.rect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    graphics.fill(color);
  }
}

export { TILE_SIZE };
