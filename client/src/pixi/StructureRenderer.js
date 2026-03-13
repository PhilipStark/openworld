/**
 * StructureRenderer — Pixel art structure sprites
 */
import { Container, Sprite, Text, TextStyle } from 'pixi.js';
import { getStructureTexture, TILE_SIZE } from './SpriteGenerator.js';

const labelStyle = new TextStyle({
  fontSize: 7,
  fontFamily: 'monospace',
  fill: 0xdddddd,
  stroke: { color: 0x000000, width: 2 },
});

export function createStructureLayer() {
  const container = new Container();
  container.label = 'structureLayer';
  container.sortableChildren = true;
  return container;
}

export function syncStructures(container, structures) {
  if (!container) return;

  // Simple: clear and rebuild (structures change rarely)
  container.removeChildren();

  for (const s of structures) {
    const group = new Container();
    group.x = s.x * TILE_SIZE;
    group.y = s.y * TILE_SIZE;
    group.zIndex = s.y * TILE_SIZE + TILE_SIZE;

    const texture = getStructureTexture(s.type);
    const sprite = new Sprite(texture);
    sprite.width = TILE_SIZE;
    sprite.height = TILE_SIZE;
    group.addChild(sprite);

    // Small type label below
    const label = new Text({
      text: s.type.replace('_', ' '),
      style: labelStyle,
    });
    label.anchor.set(0.5, 0);
    label.x = TILE_SIZE / 2;
    label.y = TILE_SIZE + 1;
    group.addChild(label);

    // Sign text content
    if (s.type === 'sign' && s.text) {
      const signText = new Text({
        text: s.text.slice(0, 20),
        style: new TextStyle({
          fontSize: 7,
          fontFamily: 'monospace',
          fill: 0x3d2817,
          wordWrap: true,
          wordWrapWidth: TILE_SIZE - 8,
        }),
      });
      signText.anchor.set(0.5, 0.5);
      signText.x = TILE_SIZE / 2;
      signText.y = TILE_SIZE * 0.35;
      group.addChild(signText);
    }

    container.addChild(group);
  }
}
