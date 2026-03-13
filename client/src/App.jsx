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
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      <TopBar viewers={viewers} agentCount={agents.length} tick={tick} connected={connected} />
      <div className="flex flex-1 overflow-hidden">
        {/* Main map area */}
        <div className="flex-1 relative">
          <WorldMap
            agents={agents}
            world={world}
            tiles={tiles}
            structures={structures}
            onAgentClick={followAgent}
            selectedAgentId={selectedAgent?.id}
            tick={tick}
          />
          {/* Chat overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 max-h-48 bg-gradient-to-t from-gray-950/95 via-gray-950/80 to-transparent pointer-events-none">
            <div className="pointer-events-auto p-2 overflow-y-auto max-h-48">
              <WorldChat messages={chat} />
            </div>
          </div>
        </div>
        {/* Agent panel sidebar */}
        <div className="w-72 lg:w-80 bg-gray-900/95 border-l border-gray-800 overflow-y-auto backdrop-blur-sm">
          <AgentPanel agent={selectedAgent} />
        </div>
      </div>
    </div>
  );
}
