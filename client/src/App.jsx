import { useSocket } from './hooks/useSocket';
import { useWorld } from './hooks/useWorld';
import WorldMap from './pixi/WorldMap';
import TopBar from './components/TopBar';
import AgentPanel from './components/AgentPanel';
import WorldChat from './components/WorldChat';

export default function App() {
  const { socket, connected } = useSocket();
  const { agents, world, tiles, structures, tick, chat, viewers, selectedAgent, followAgent } = useWorld(socket);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <TopBar viewers={viewers} agentCount={agents.length} tick={tick} connected={connected} />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <WorldMap agents={agents} world={world} tiles={tiles} structures={structures} onAgentClick={followAgent} selectedAgentId={selectedAgent?.id} />
          <div className="absolute bottom-0 left-0 right-0 h-48 bg-gray-800/90 border-t border-gray-700 overflow-y-auto">
            <WorldChat messages={chat} />
          </div>
        </div>
        <div className="w-80 bg-gray-800 border-l border-gray-700 overflow-y-auto">
          <AgentPanel agent={selectedAgent} />
        </div>
      </div>
    </div>
  );
}
