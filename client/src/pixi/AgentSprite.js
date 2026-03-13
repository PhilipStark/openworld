import { TILE_SIZE } from './TileRenderer.js';

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const AGENT_COLORS = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf9ca24, 0xa55eea, 0x26de81, 0xfc5c65, 0x778ca3];

export function drawAgents(graphics, agents, selectedId) {
  graphics.clear();
  const radius = TILE_SIZE / 3;

  for (const agent of agents) {
    const cx = agent.x * TILE_SIZE + TILE_SIZE / 2;
    const cy = agent.y * TILE_SIZE + TILE_SIZE / 2;
    const color = AGENT_COLORS[hashCode(agent.id) % AGENT_COLORS.length];

    // Selection highlight
    if (agent.id === selectedId) {
      graphics.circle(cx, cy, radius + 4);
      graphics.fill(0xffffff);
    }

    graphics.circle(cx, cy, radius);
    graphics.fill(color);

    // Sleeping indicator
    if (agent.status === 'sleeping') {
      graphics.circle(cx, cy, radius);
      graphics.fill({ color: 0x000000, alpha: 0.5 });
    }
  }
}
