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
        {/* Right sidebar */}
        <div className="w-72 lg:w-80 bg-gray-900/95 border-l border-gray-800 overflow-y-auto backdrop-blur-sm flex flex-col">
          <AgentPanel agent={selectedAgent} />
          {/* Agent list */}
          <div className="border-t border-gray-800 px-3 py-2">
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Agents ({agents.filter(a => a.status === 'awake').length} awake)</p>
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {agents
                .filter(a => a.status !== 'dead')
                .sort((a, b) => (a.status === 'awake' ? 0 : 1) - (b.status === 'awake' ? 0 : 1))
                .map(a => (
                  <button
                    key={a.id}
                    onClick={() => followAgent(a.id)}
                    className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1.5 hover:bg-gray-800 transition-colors ${
                      selectedAgent?.id === a.id ? 'bg-gray-800 ring-1 ring-amber-500/50' : ''
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.status === 'awake' ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span className="text-gray-300 truncate">{a.name}</span>
                    <span className="ml-auto text-gray-600 text-[8px]">{a.hp}hp</span>
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
