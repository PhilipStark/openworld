/**
 * AgentSprite — Pixel art character rendering with smooth movement
 * Replaces colored circles with Tibia-style animated character sprites
 */
import { Container, Sprite, Text, TextStyle, Graphics } from 'pixi.js';
import { getCharacterTexture, TILE_SIZE } from './SpriteGenerator.js';

// ─── Agent state tracking for smooth movement ──────────────────────
const agentStates = new Map();

function getAgentState(id) {
  if (!agentStates.has(id)) {
    agentStates.set(id, {
      displayX: -1, displayY: -1, // current render position (in pixels)
      targetX: 0, targetY: 0,     // target position (in pixels)
      direction: 0,               // 0=down, 1=left, 2=up, 3=right
      walkFrame: 0,               // 0-3 walk animation cycle
      walkTimer: 0,
      initialized: false,
    });
  }
  return agentStates.get(id);
}

function computeDirection(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 3 : 1; // right or left
  }
  return dy > 0 ? 0 : 2; // down or up
}

// ─── Lerp for smooth movement ──────────────────────────────────────
function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, t);
}

// ─── Update smooth movement (call each frame) ─────────────────────
export function updateAgentMovement(dt) {
  const speed = 0.004; // pixels per ms (smooth glide)
  for (const [id, state] of agentStates) {
    if (!state.initialized) continue;

    const dx = state.targetX - state.displayX;
    const dy = state.targetY - state.displayY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 1) {
      const t = speed * dt;
      state.displayX = lerp(state.displayX, state.targetX, t);
      state.displayY = lerp(state.displayY, state.targetY, t);

      // Walk animation
      state.walkTimer += dt;
      if (state.walkTimer > 200) {
        state.walkTimer = 0;
        state.walkFrame = (state.walkFrame + 1) % 4;
      }
    } else {
      state.displayX = state.targetX;
      state.displayY = state.targetY;
      state.walkFrame = 0; // idle
    }
  }
}

// ─── Create agent visual container ─────────────────────────────────

const nameStyle = new TextStyle({
  fontSize: 9,
  fontFamily: '"Press Start 2P", monospace',
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 3 },
  letterSpacing: -1,
});

const thinkStyle = new TextStyle({
  fontSize: 8,
  fontFamily: 'monospace',
  fill: 0xe8d4f8,
  wordWrap: true,
  wordWrapWidth: 120,
  stroke: { color: 0x2a1040, width: 2 },
});

const speechStyle = new TextStyle({
  fontSize: 8,
  fontFamily: '"Press Start 2P", monospace',
  fill: 0x222222,
  wordWrap: true,
  wordWrapWidth: 100,
  letterSpacing: -1,
});

// Track speech bubbles with timers
const speechBubbles = new Map(); // agentId -> { text, expiresAt }

export function createAgentContainer() {
  const container = new Container();
  container.label = 'agentLayer';
  container.sortableChildren = true;
  return container;
}

/**
 * Show a speech bubble for an agent (called from outside)
 */
export function showSpeechBubble(agentId, text) {
  speechBubbles.set(agentId, { text: text.slice(0, 60), expiresAt: Date.now() + 5000 });
}

/**
 * Sync agent sprites with current agent data
 * Efficiently reuses sprites, creates/removes as needed
 */
export function syncAgents(agentContainer, agents, selectedId) {
  if (!agentContainer) return;

  const currentIds = new Set(agents.map(a => a.id));
  const existingSprites = new Map();

  // Index existing agent containers
  for (const child of [...agentContainer.children]) {
    if (child.agentId) {
      if (!currentIds.has(child.agentId)) {
        // Agent gone — remove
        agentContainer.removeChild(child);
        child.destroy({ children: true });
        agentStates.delete(child.agentId);
      } else {
        existingSprites.set(child.agentId, child);
      }
    }
  }

  // Update or create agent sprites
  for (const agent of agents) {
    const state = getAgentState(agent.id);
    const targetPx = agent.x * TILE_SIZE + TILE_SIZE / 2;
    const targetPy = agent.y * TILE_SIZE + TILE_SIZE / 2;

    // Update target position and direction
    if (state.initialized) {
      const dx = targetPx - state.targetX;
      const dy = targetPy - state.targetY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        state.direction = computeDirection(dx, dy);
      }
    } else {
      state.displayX = targetPx;
      state.displayY = targetPy;
      state.initialized = true;
    }
    state.targetX = targetPx;
    state.targetY = targetPy;

    let agentGroup = existingSprites.get(agent.id);

    if (!agentGroup) {
      // Create new agent sprite group
      agentGroup = new Container();
      agentGroup.agentId = agent.id;
      agentGroup.sortableChildren = true;

      // Character sprite
      const charSprite = new Sprite(getCharacterTexture(agent.id, state.direction, state.walkFrame));
      charSprite.anchor.set(0.5, 0.8);
      charSprite.label = 'char';
      charSprite.zIndex = 1;
      agentGroup.addChild(charSprite);

      // Name label (created once, reused)
      const nameText = new Text({ text: agent.name || agent.id.slice(0, 8), style: nameStyle });
      nameText.anchor.set(0.5, 1);
      nameText.y = -TILE_SIZE * 0.6;
      nameText.label = 'name';
      nameText.zIndex = 10;
      agentGroup.addChild(nameText);

      // HP bar background
      const hpBg = new Graphics();
      hpBg.rect(-12, -TILE_SIZE * 0.4, 24, 3);
      hpBg.fill(0x1a1a1a);
      hpBg.label = 'hpBg';
      hpBg.zIndex = 9;
      agentGroup.addChild(hpBg);

      // HP bar fill
      const hpFill = new Graphics();
      hpFill.label = 'hpFill';
      hpFill.zIndex = 9;
      agentGroup.addChild(hpFill);

      // Selection indicator
      const selection = new Graphics();
      selection.label = 'selection';
      selection.zIndex = 0;
      agentGroup.addChild(selection);

      agentContainer.addChild(agentGroup);
    }

    // Update character texture (direction + animation frame)
    const charSprite = agentGroup.children.find(c => c.label === 'char');
    if (charSprite) {
      charSprite.texture = getCharacterTexture(agent.id, state.direction, state.walkFrame);

      // Sleeping overlay: semi-transparent + blue tint
      if (agent.status === 'sleeping') {
        charSprite.alpha = 0.6;
        charSprite.tint = 0x8888cc;
      } else if (agent.status === 'dead') {
        charSprite.alpha = 0.3;
        charSprite.tint = 0x666666;
        charSprite.rotation = Math.PI / 2;
      } else {
        charSprite.alpha = 1;
        charSprite.tint = 0xffffff;
        charSprite.rotation = 0;
      }
    }

    // Update HP bar
    const hpFill = agentGroup.children.find(c => c.label === 'hpFill');
    if (hpFill) {
      hpFill.clear();
      const hpPct = Math.max(0, Math.min(1, (agent.hp || 0) / 100));
      const hpColor = hpPct > 0.5 ? 0x2ecc71 : hpPct > 0.25 ? 0xf39c12 : 0xe74c3c;
      hpFill.rect(-12, -TILE_SIZE * 0.4, 24 * hpPct, 3);
      hpFill.fill(hpColor);
    }

    // Update selection indicator
    const selection = agentGroup.children.find(c => c.label === 'selection');
    if (selection) {
      selection.clear();
      if (agent.id === selectedId) {
        selection.circle(0, 4, TILE_SIZE * 0.55);
        selection.stroke({ color: 0xf1c40f, width: 2, alpha: 0.8 });
        // Pulsing glow effect
        selection.circle(0, 4, TILE_SIZE * 0.6);
        selection.stroke({ color: 0xf1c40f, width: 1, alpha: 0.3 });
      }
    }

    // Speech bubble
    let bubble = agentGroup.children.find(c => c.label === 'speechBubble');
    const speechData = speechBubbles.get(agent.id);
    if (speechData && Date.now() < speechData.expiresAt) {
      if (!bubble) {
        bubble = new Container();
        bubble.label = 'speechBubble';
        bubble.zIndex = 20;

        const bg = new Graphics();
        bg.label = 'speechBg';
        bubble.addChild(bg);

        const txt = new Text({ text: '', style: speechStyle });
        txt.anchor.set(0.5, 1);
        txt.label = 'speechText';
        bubble.addChild(txt);

        agentGroup.addChild(bubble);
      }

      const txt = bubble.children.find(c => c.label === 'speechText');
      const bg = bubble.children.find(c => c.label === 'speechBg');
      if (txt && bg) {
        txt.text = speechData.text;
        txt.y = -TILE_SIZE * 0.9;

        bg.clear();
        const pad = 4;
        const w = Math.min(txt.width + pad * 2, 110);
        const h = txt.height + pad * 2;
        bg.roundRect(-w / 2, -TILE_SIZE * 0.9 - h, w, h, 4);
        bg.fill({ color: 0xffffff, alpha: 0.92 });
        bg.stroke({ color: 0xcccccc, width: 1 });
        // Speech bubble tail
        bg.moveTo(-3, -TILE_SIZE * 0.9);
        bg.lineTo(0, -TILE_SIZE * 0.9 + 4);
        bg.lineTo(3, -TILE_SIZE * 0.9);
        bg.fill({ color: 0xffffff, alpha: 0.92 });
      }
      bubble.visible = true;
    } else {
      if (bubble) bubble.visible = false;
      if (speechData && Date.now() >= speechData.expiresAt) {
        speechBubbles.delete(agent.id);
      }
    }

    // Update position from smooth movement state
    agentGroup.x = state.displayX;
    agentGroup.y = state.displayY;
    agentGroup.zIndex = Math.floor(state.displayY); // depth sort
  }
}

/**
 * Get display position for camera following
 */
export function getAgentDisplayPos(agentId) {
  const state = agentStates.get(agentId);
  if (!state || !state.initialized) return null;
  return { x: state.displayX, y: state.displayY };
}

// Cleanup
export function clearAgentStates() {
  agentStates.clear();
}

// Legacy compat
export function drawAgents() {}
