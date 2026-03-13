import { useState, useEffect, useCallback } from 'react';

export function useWorld(socket) {
  const [agents, setAgents] = useState([]);
  const [world, setWorld] = useState({ width: 50, height: 50 });
  const [tiles, setTiles] = useState([]);
  const [structures, setStructures] = useState([]);
  const [tick, setTick] = useState(0);
  const [chat, setChat] = useState([]);
  const [viewers, setViewers] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState(null);

  useEffect(() => {
    if (!socket) return;
    socket.on('tiles', (data) => {
      setTiles(data.tiles);
      setWorld({ width: data.width, height: data.height });
    });
    socket.on('world', (data) => {
      setAgents(data.agents);
      setWorld(data.world);
      setTick(data.tick);
      if (data.structures) setStructures(data.structures);
    });
    socket.on('chat', (messages) => {
      setChat(prev => [...messages, ...prev].slice(0, 200));
    });
    socket.on('viewers', setViewers);
    return () => {
      socket.off('tiles');
      socket.off('world');
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
