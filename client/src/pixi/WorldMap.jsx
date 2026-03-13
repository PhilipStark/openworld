import { useRef, useEffect, useCallback, useState } from 'react';
import { Application, Graphics, Container, Text, TextStyle } from 'pixi.js';
import { drawTiles, TILE_SIZE } from './TileRenderer.js';
import { drawAgents } from './AgentSprite.js';

export default function WorldMap({ agents, world, tiles, structures, onAgentClick, selectedAgentId }) {
  const containerRef = useRef(null);
  const appRef = useRef(null);
  const tileGraphicsRef = useRef(null);
  const agentGraphicsRef = useRef(null);
  const structureGraphicsRef = useRef(null);
  const nameTextsRef = useRef([]);
  const worldContainerRef = useRef(null);
  const scaleRef = useRef(1);
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const [ready, setReady] = useState(false);

  // Initialize Pixi app
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    const app = new Application();

    const initApp = async () => {
      await app.init({
        resizeTo: containerRef.current,
        background: 0x111827,
        antialias: false,
      });

      if (cancelled) { app.destroy(true); return; }

      containerRef.current.appendChild(app.canvas);
      appRef.current = app;

      const worldContainer = new Container();
      worldContainerRef.current = worldContainer;
      app.stage.addChild(worldContainer);

      const tileG = new Graphics();
      tileGraphicsRef.current = tileG;
      worldContainer.addChild(tileG);

      const structG = new Graphics();
      structureGraphicsRef.current = structG;
      worldContainer.addChild(structG);

      const agentG = new Graphics();
      agentGraphicsRef.current = agentG;
      worldContainer.addChild(agentG);

      setReady(true);
    };
    initApp();

    return () => {
      cancelled = true;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
      tileGraphicsRef.current = null;
      agentGraphicsRef.current = null;
      structureGraphicsRef.current = null;
      worldContainerRef.current = null;
      setReady(false);
    };
  }, []);

  // Draw tiles (only when tiles change or app becomes ready)
  useEffect(() => {
    if (!ready || !tileGraphicsRef.current || tiles.length === 0) return;
    drawTiles(tileGraphicsRef.current, tiles);
  }, [tiles, ready]);

  // Draw agents (every tick)
  useEffect(() => {
    if (!ready || !agentGraphicsRef.current) return;
    drawAgents(agentGraphicsRef.current, agents, selectedAgentId);

    // Remove old name texts
    for (const t of nameTextsRef.current) {
      t.destroy();
    }
    nameTextsRef.current = [];

    // Draw name labels
    if (worldContainerRef.current) {
      for (const agent of agents) {
        const text = new Text({
          text: agent.name,
          style: new TextStyle({ fontSize: 10, fill: 0xffffff, fontFamily: 'monospace' }),
        });
        text.x = agent.x * TILE_SIZE + TILE_SIZE / 2;
        text.y = agent.y * TILE_SIZE - 8;
        text.anchor.set(0.5, 1);
        worldContainerRef.current.addChild(text);
        nameTextsRef.current.push(text);
      }
    }
  }, [agents, selectedAgentId, ready]);

  // Draw structures
  useEffect(() => {
    if (!ready || !structureGraphicsRef.current) return;
    const g = structureGraphicsRef.current;
    g.clear();

    const STRUCTURE_COLORS = {
      shelter: 0xcd853f, storage: 0x8b4513, crafting_table: 0xdaa520,
      bridge: 0xa0522d, wall: 0x696969, door: 0x8b7355, sign: 0xf5f5dc,
    };

    for (const s of structures) {
      const color = STRUCTURE_COLORS[s.type] || 0x999999;
      g.rect(s.x * TILE_SIZE + 4, s.y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      g.fill(color);
    }
  }, [structures, ready]);

  // Mouse handlers for pan/zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const wc = worldContainerRef.current;
      if (!wc) return;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(5, scaleRef.current * factor));
      scaleRef.current = newScale;
      wc.scale.set(newScale);
    };

    const handleMouseDown = (e) => {
      dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
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
      const clicked = agents.find(a => a.x === tileX && a.y === tileY);
      if (clicked) onAgentClick(clicked.id);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('click', handleClick);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('click', handleClick);
    };
  }, [agents, onAgentClick]);

  return <div ref={containerRef} className="w-full h-full" />;
}
