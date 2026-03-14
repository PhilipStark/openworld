import { useState, useEffect, useCallback, useRef } from 'react';

export function useWorld(socket) {
  const [agents, setAgents] = useState([]);
  const [world, setWorld] = useState({ width: 50, height: 50 });
  const [tiles, setTiles] = useState([]);
  const [structures, setStructures] = useState([]);
  const [tick, setTick] = useState(0);
  const [chat, setChat] = useState([]);
  const [viewers, setViewers] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const agentMapRef = useRef(new Map());

  useEffect(() => {
    if (!socket) return;

    socket.on('tiles', (data) => {
      setTiles(data.tiles);
      setWorld({ width: data.width, height: data.height });
    });

    // Full state (sent on initial connection)
    socket.on('world_full', (data) => {
      const map = new Map();
      for (const a of data.agents) {
        map.set(a.id, a);
      }
      agentMapRef.current = map;
      setAgents(data.agents);
      setWorld(data.world);
      if (data.structures) setStructures(data.structures);
    });

    // Legacy full world event (backwards compat)
    socket.on('world', (data) => {
      const map = new Map();
      for (const a of data.agents) {
        map.set(a.id, a);
      }
      agentMapRef.current = map;
      setAgents(data.agents);
      setWorld(data.world);
      setTick(data.tick);
      if (data.structures) setStructures(data.structures);
    });

    // Delta tick updates
    socket.on('tick', (data) => {
      setTick(data.tick);
      if (data.world) setWorld(data.world);

      const map = agentMapRef.current;

      // Remove dead/disconnected agents
      if (data.removed) {
        for (const id of data.removed) {
          map.delete(id);
        }
      }

      // Apply agent deltas
      if (data.agents) {
        for (const delta of data.agents) {
          const existing = map.get(delta.id);
          if (existing) {
            // Merge delta into existing
            map.set(delta.id, { ...existing, ...delta });
          } else {
            // New agent
            map.set(delta.id, delta);
          }
        }
      }

      setAgents(Array.from(map.values()));

      // Structures only sent when changed
      if (data.structures) setStructures(data.structures);
    });

    socket.on('chat', (messages) => {
      setChat(prev => [...messages, ...prev].slice(0, 200));
    });
    socket.on('viewers', setViewers);

    return () => {
      socket.off('tiles');
      socket.off('world');
      socket.off('world_full');
      socket.off('tick');
      socket.off('chat');
      socket.off('viewers');
    };
  }, [socket]);

  const followAgent = useCallback((agentId) => {
    setSelectedAgent(agents.find(a => a.id === agentId) || null);
    socket?.emit('follow', agentId);
  }, [socket, agents]);

  return { agents, world, tiles, structures, tick, chat, viewers, selectedAgent, followAgent };
}
