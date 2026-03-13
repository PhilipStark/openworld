export default function AgentPanel({ agent }) {
  if (!agent) {
    return (
      <div className="p-4 text-gray-500 text-center">
        <p className="text-lg mb-2">Click an agent on the map</p>
        <p className="text-sm">to see their details</p>
      </div>
    );
  }

  const hpPercent = Math.max(0, agent.hp);
  const energyPercent = Math.max(0, agent.energy);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-lg font-bold">{agent.name}</h2>
        <span className={`text-xs px-2 py-0.5 rounded ${
          agent.status === 'awake' ? 'bg-green-500/20 text-green-400' :
          agent.status === 'sleeping' ? 'bg-blue-500/20 text-blue-400' :
          agent.status === 'exhausted' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-red-500/20 text-red-400'
        }`}>{agent.status}</span>
        <p className="text-xs text-gray-500 mt-1">({agent.x}, {agent.y})</p>
      </div>

      {agent.bio && <p className="text-sm text-gray-400 italic">"{agent.bio}"</p>}

      {/* HP Bar */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span>HP</span><span>{agent.hp}/100</span>
        </div>
        <div className="w-full bg-gray-700 rounded h-2">
          <div className="bg-red-500 h-2 rounded transition-all" style={{ width: `${hpPercent}%` }} />
        </div>
      </div>

      {/* Energy Bar */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span>Energy</span><span>{agent.energy}/100</span>
        </div>
        <div className="w-full bg-gray-700 rounded h-2">
          <div className="bg-yellow-500 h-2 rounded transition-all" style={{ width: `${energyPercent}%` }} />
        </div>
      </div>

      {/* Equipment */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Equipment</h3>
        <div className="grid grid-cols-3 gap-1 text-xs">
          <div className="bg-gray-700 rounded p-1 text-center">{agent.weapon || '—'}</div>
          <div className="bg-gray-700 rounded p-1 text-center">{agent.shield || '—'}</div>
          <div className="bg-gray-700 rounded p-1 text-center">{agent.tool || '—'}</div>
        </div>
      </div>

      {/* Inventory */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Inventory</h3>
        {agent.inventory && agent.inventory.length > 0 ? (
          <div className="space-y-1">
            {agent.inventory.map((item, i) => (
              <div key={i} className="flex justify-between text-xs bg-gray-700 rounded px-2 py-1">
                <span>{item.item}</span><span className="text-gray-400">x{item.qty}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600">Empty</p>
        )}
      </div>

      {/* Thinking */}
      {agent.thinking && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded p-2">
          <h3 className="text-xs font-semibold text-purple-400 mb-1">THINKING</h3>
          <p className="text-xs text-purple-300">{agent.thinking}</p>
        </div>
      )}

      {/* Current Action */}
      {agent.busy_action && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
          <p className="text-xs text-blue-300">{agent.busy_action} ({agent.busy_ticks_remaining} ticks left)</p>
        </div>
      )}
    </div>
  );
}
