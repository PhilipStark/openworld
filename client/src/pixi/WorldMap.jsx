/**
 * WorldMap — Pixi.js 8 world renderer with pixel art sprites
 * Features: sprite tiles, animated characters, smooth movement,
 * day/night cycle, minimap, thought bubbles, depth sorting
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { Application, Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js';
import { TILE_SIZE, drawTiles, updateWaterAnimation } from './TileRenderer.js';
import { createAgentContainer, syncAgents, updateAgentMovement, getAgentDisplayPos, clearAgentStates, showSpeechBubble } from './AgentSprite.js';
import { createStructureLayer, syncStructures } from './StructureRenderer.js';
import { preloadTextures } from './SpriteGenerator.js';

export default function WorldMap({ agents, world, tiles, structures, onAgentClick, selectedAgentId, tick }) {
  const containerRef = useRef(null);
  const appRef = useRef(null);
  const worldContainerRef = useRef(null);
  const tileContainerRef = useRef(null);
  const structureContainerRef = useRef(null);
  const agentContainerRef = useRef(null);
  const overlayRef = useRef(null);
  const minimapRef = useRef(null);
  const scaleRef = useRef(1);
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const [ready, setReady] = useState(false);
  const followingRef = useRef(null);

  // Initialize Pixi app with render loop
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    const app = new Application();

    const initApp = async () => {
      // Preload sprite textures
      preloadTextures();

      await app.init({
        resizeTo: containerRef.current,
        background: 0x0a0a12,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (cancelled) { app.destroy(true); return; }

      containerRef.current.appendChild(app.canvas);
      app.canvas.style.imageRendering = 'pixelated';
      appRef.current = app;

      // World container (panned/zoomed)
      const worldContainer = new Container();
      worldContainer.sortableChildren = true;
      worldContainerRef.current = worldContainer;
      app.stage.addChild(worldContainer);

      // Tile layer (Container of Sprites, not Graphics)
      const tileContainer = new Container();
      tileContainer.label = 'tiles';
      tileContainer.zIndex = 0;
      tileContainerRef.current = tileContainer;
      worldContainer.addChild(tileContainer);

      // Structure layer
      const structContainer = createStructureLayer();
      structContainer.zIndex = 1;
      structureContainerRef.current = structContainer;
      worldContainer.addChild(structContainer);

      // Agent layer
      const agentContainer = createAgentContainer();
      agentContainer.zIndex = 2;
      agentContainerRef.current = agentContainer;
      worldContainer.addChild(agentContainer);

      // Day/night overlay
      const overlay = new Graphics();
      overlay.zIndex = 100;
      overlayRef.current = overlay;
      app.stage.addChild(overlay);

      // Minimap container (fixed on screen)
      const minimap = new Container();
      minimap.zIndex = 200;
      minimapRef.current = minimap;
      app.stage.addChild(minimap);

      // Render loop — smooth movement + water animation + day/night
      app.ticker.add((ticker) => {
        const dt = ticker.deltaMS;

        // Update smooth agent movement
        updateAgentMovement(dt);

        // Re-sync agent positions (sprites follow their states)
        if (agentContainerRef.current) {
          for (const child of agentContainerRef.current.children) {
            if (child.agentId) {
              const pos = getAgentDisplayPos(child.agentId);
              if (pos) {
                child.x = pos.x;
                child.y = pos.y;
                child.zIndex = Math.floor(pos.y);
              }
            }
          }
        }

        // Water animation
        updateWaterAnimation(tileContainerRef.current, dt);

        // Camera follow selected agent
        if (followingRef.current && worldContainerRef.current && appRef.current) {
          const pos = getAgentDisplayPos(followingRef.current);
          if (pos) {
            const wc = worldContainerRef.current;
            const screen = appRef.current.screen;
            const targetX = screen.width / 2 - pos.x * scaleRef.current;
            const targetY = screen.height / 2 - pos.y * scaleRef.current;
            wc.x = lerp(wc.x, targetX, 0.05);
            wc.y = lerp(wc.y, targetY, 0.05);
          }
        }
      });

      setReady(true);
    };
    initApp();

    return () => {
      cancelled = true;
      clearAgentStates();
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
      tileContainerRef.current = null;
      agentContainerRef.current = null;
      structureContainerRef.current = null;
      worldContainerRef.current = null;
      overlayRef.current = null;
      minimapRef.current = null;
      setReady(false);
    };
  }, []);

  // Draw tiles when they change
  useEffect(() => {
    if (!ready || !tileContainerRef.current || tiles.length === 0) return;
    drawTiles(tileContainerRef.current, tiles);
  }, [tiles, ready]);

  // Sync agents every tick
  useEffect(() => {
    if (!ready || !agentContainerRef.current) return;
    syncAgents(agentContainerRef.current, agents, selectedAgentId);
  }, [agents, selectedAgentId, ready]);

  // Sync structures
  useEffect(() => {
    if (!ready || !structureContainerRef.current) return;
    syncStructures(structureContainerRef.current, structures);
  }, [structures, ready]);

  // Day/night cycle overlay
  useEffect(() => {
    if (!ready || !overlayRef.current || !appRef.current) return;
    const overlay = overlayRef.current;
    const screen = appRef.current.screen;
    overlay.clear();

    const timeOfDay = (tick || 0) % 2400;
    let nightAlpha = 0;
    if (timeOfDay >= 1200 && timeOfDay < 1500) {
      // Sunset transition (1200-1500)
      nightAlpha = (timeOfDay - 1200) / 300 * 0.35;
    } else if (timeOfDay >= 1500 || timeOfDay < 300) {
      // Full night
      nightAlpha = 0.35;
    } else if (timeOfDay >= 300 && timeOfDay < 600) {
      // Sunrise transition (300-600)
      nightAlpha = (1 - (timeOfDay - 300) / 300) * 0.35;
    }

    if (nightAlpha > 0.01) {
      overlay.rect(0, 0, screen.width, screen.height);
      overlay.fill({ color: 0x0a0a30, alpha: nightAlpha });
    }
  }, [tick, ready]);

  // Minimap
  useEffect(() => {
    if (!ready || !minimapRef.current || !appRef.current || tiles.length === 0) return;
    const minimap = minimapRef.current;
    minimap.removeChildren();

    const screen = appRef.current.screen;
    const mmSize = Math.min(140, screen.width * 0.18);
    const mmX = screen.width - mmSize - 10;
    const mmY = 10;
    const mmScale = mmSize / (world.width * TILE_SIZE);

    // Background
    const bg = new Graphics();
    bg.roundRect(mmX - 2, mmY - 2, mmSize + 4, mmSize + 4, 4);
    bg.fill({ color: 0x000000, alpha: 0.7 });
    bg.stroke({ color: 0x444444, width: 1 });
    minimap.addChild(bg);

    // Tile dots
    const tileDots = new Graphics();
    const MINIMAP_COLORS = {
      grass: 0x5a9e3e, water: 0x3a7abd, rock: 0x7a7a7a,
      sand: 0xd4b84a, forest: 0x2d6e1e, mountain: 0x5a4a3a,
      fertile_soil: 0x6b4226,
    };
    for (const tile of tiles) {
      const color = MINIMAP_COLORS[tile.type] || 0x333333;
      const px = mmX + tile.x * TILE_SIZE * mmScale;
      const py = mmY + tile.y * TILE_SIZE * mmScale;
      const size = Math.max(1, TILE_SIZE * mmScale);
      tileDots.rect(px, py, size, size);
      tileDots.fill(color);
    }
    minimap.addChild(tileDots);

    // Agent dots
    const agentDots = new Graphics();
    for (const agent of agents) {
      const px = mmX + agent.x * TILE_SIZE * mmScale;
      const py = mmY + agent.y * TILE_SIZE * mmScale;
      const dotColor = agent.id === selectedAgentId ? 0xf1c40f : 0xff4444;
      const dotSize = agent.id === selectedAgentId ? 3 : 2;
      agentDots.circle(px + TILE_SIZE * mmScale / 2, py + TILE_SIZE * mmScale / 2, dotSize);
      agentDots.fill(dotColor);
    }
    minimap.addChild(agentDots);

    // Viewport rectangle
    if (worldContainerRef.current) {
      const wc = worldContainerRef.current;
      const vpX = mmX + (-wc.x / scaleRef.current) * mmScale;
      const vpY = mmY + (-wc.y / scaleRef.current) * mmScale;
      const vpW = (screen.width / scaleRef.current) * mmScale;
      const vpH = (screen.height / scaleRef.current) * mmScale;
      const vp = new Graphics();
      vp.rect(vpX, vpY, vpW, vpH);
      vp.stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
      minimap.addChild(vp);
    }
  }, [tiles, agents, selectedAgentId, tick, ready, world]);

  // Follow selected agent
  useEffect(() => {
    followingRef.current = selectedAgentId;
  }, [selectedAgentId]);

  // Mouse/touch handlers for pan/zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const wc = worldContainerRef.current;
      if (!wc) return;

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const oldScale = scaleRef.current;
      const newScale = Math.max(0.3, Math.min(4, oldScale * factor));

      // Zoom toward mouse position
      wc.x = mouseX - (mouseX - wc.x) * (newScale / oldScale);
      wc.y = mouseY - (mouseY - wc.y) * (newScale / oldScale);
      scaleRef.current = newScale;
      wc.scale.set(newScale);
    };

    const handleMouseDown = (e) => {
      dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
      followingRef.current = null; // Stop following when user drags
    };

    const handleMouseMove = (e) => {
      if (!dragRef.current.dragging) return;
      const wc = worldContainerRef.current;
      if (!wc) return;
      wc.x += e.clientX - dragRef.current.lastX;
      wc.y += e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
    };

    const handleMouseUp = () => {
      dragRef.current.dragging = false;
    };

    const handleClick = (e) => {
      if (!onAgentClick || !worldContainerRef.current) return;
      const wc = worldContainerRef.current;
      const rect = el.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - wc.x) / scaleRef.current;
      const worldY = (e.clientY - rect.top - wc.y) / scaleRef.current;
      const tileX = Math.floor(worldX / TILE_SIZE);
      const tileY = Math.floor(worldY / TILE_SIZE);

      // Check agents within ~1 tile radius
      let closest = null;
      let closestDist = TILE_SIZE * 1.2;
      for (const a of agents) {
        const dx = worldX - (a.x * TILE_SIZE + TILE_SIZE / 2);
        const dy = worldY - (a.y * TILE_SIZE + TILE_SIZE / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closest = a;
          closestDist = dist;
        }
      }
      if (closest) onAgentClick(closest.id);
    };

    // Touch support
    const handleTouchStart = (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        dragRef.current = { dragging: true, lastX: t.clientX, lastY: t.clientY };
        followingRef.current = null;
      }
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      if (!dragRef.current.dragging || e.touches.length !== 1) return;
      const t = e.touches[0];
      const wc = worldContainerRef.current;
      if (!wc) return;
      wc.x += t.clientX - dragRef.current.lastX;
      wc.y += t.clientY - dragRef.current.lastY;
      dragRef.current.lastX = t.clientX;
      dragRef.current.lastY = t.clientY;
    };

    const handleTouchEnd = () => {
      dragRef.current.dragging = false;
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('mouseleave', handleMouseUp);
    el.addEventListener('click', handleClick);
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('mouseleave', handleMouseUp);
      el.removeEventListener('click', handleClick);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [agents, onAgentClick]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
    />
  );
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
