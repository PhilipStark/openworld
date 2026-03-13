export default function AgentPanel({ agent }) {
  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-600 p-6">
        <div className="text-4xl mb-3 opacity-50">⚔️</div>
        <p className="text-sm font-medium mb-1">Select an Agent</p>
        <p className="text-xs text-gray-700 text-center">Click on a character in the world to inspect their stats</p>
      </div>
    );
  }

  const hpPercent = Math.max(0, Math.min(100, agent.hp || 0));
  const energyPercent = Math.max(0, Math.min(100, agent.energy || 0));
  const statusConfig = {
    awake: { color: 'emerald', icon: '🟢', label: 'Awake' },
    sleeping: { color: 'blue', icon: '💤', label: 'Sleeping' },
    exhausted: { color: 'amber', icon: '😮‍💨', label: 'Exhausted' },
    dead: { color: 'red', icon: '💀', label: 'Dead' },
  };
  const status = statusConfig[agent.status] || statusConfig.awake;

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-bold text-amber-300" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '10px' }}>
              {agent.name}
            </h2>
            <p className="text-[10px] text-gray-500 mt-1 tabular-nums">({agent.x}, {agent.y})</p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border bg-${status.color}-500/10 text-${status.color}-400 border-${status.color}-500/30`}>
            {status.icon} {status.label}
          </span>
        </div>
        {agent.bio && (
          <p className="text-[11px] text-gray-400 italic mt-2 leading-relaxed">"{agent.bio}"</p>
        )}
      </div>

      {/* HP & Energy Bars */}
      <div className="space-y-2">
        <StatBar
          label="HP"
          value={agent.hp}
          max={100}
          percent={hpPercent}
          color={hpPercent > 50 ? '#2ecc71' : hpPercent > 25 ? '#f39c12' : '#e74c3c'}
          icon="❤️"
        />
        <StatBar
          label="Energy"
          value={agent.energy}
          max={100}
          percent={energyPercent}
          color={energyPercent > 50 ? '#f1c40f' : energyPercent > 25 ? '#e67e22' : '#e74c3c'}
          icon="⚡"
        />
      </div>

      {/* Equipment */}
      <div className="bg-gray-800/30 rounded-lg p-2 border border-gray-700/30">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Equipment</h3>
        <div className="grid grid-cols-3 gap-1.5">
          <EquipSlot label="Weapon" item={agent.weapon} icon="⚔️" />
          <EquipSlot label="Shield" item={agent.shield} icon="🛡️" />
          <EquipSlot label="Tool" item={agent.tool} icon="⛏️" />
        </div>
      </div>

      {/* Inventory */}
      <div className="bg-gray-800/30 rounded-lg p-2 border border-gray-700/30">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
          Inventory {agent.inventory ? `(${agent.inventory.length}/20)` : ''}
        </h3>
        {agent.inventory && agent.inventory.length > 0 ? (
          <div className="grid grid-cols-2 gap-1">
            {agent.inventory.map((item, i) => (
              <div key={i} className="flex justify-between items-center text-[11px] bg-gray-800/60 rounded px-2 py-1 border border-gray-700/20">
                <span className="text-gray-300 truncate">{getItemIcon(item.item)} {item.item}</span>
                <span className="text-gray-500 ml-1 flex-shrink-0">×{item.qty}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-700 text-center py-2">Empty backpack</p>
        )}
      </div>

      {/* Thinking */}
      {agent.thinking && (
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-2">
          <h3 className="text-[10px] font-bold text-purple-400 mb-1">💭 THINKING</h3>
          <p className="text-[11px] text-purple-300/80 leading-relaxed">{agent.thinking}</p>
        </div>
      )}

      {/* Current Action */}
      {agent.busy_action && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2">
          <div className="flex items-center gap-1.5">
            <span className="animate-pulse text-blue-400">⏳</span>
            <p className="text-[11px] text-blue-300">
              {agent.busy_action}
              <span className="text-blue-500 ml-1">({agent.busy_ticks_remaining}t left)</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBar({ label, value, max, percent, color, icon }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-gray-400">{icon} {label}</span>
        <span className="text-gray-500 tabular-nums">{value}/{max}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-sm h-2 overflow-hidden border border-gray-700/50">
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function EquipSlot({ label, item, icon }) {
  return (
    <div className="bg-gray-800/60 rounded p-1.5 text-center border border-gray-700/30">
      <div className="text-[10px] text-gray-600 mb-0.5">{icon}</div>
      <div className="text-[10px] text-gray-300 truncate">{item || '—'}</div>
      <div className="text-[8px] text-gray-600">{label}</div>
    </div>
  );
}

function getItemIcon(name) {
  const icons = {
    wood: '🪵', stone: '🪨', food: '🍖', herb: '🌿', ore: '⛏️',
    iron: '🔩', gold: '🪙', fish: '🐟', berry: '🫐', wheat: '🌾',
    sword: '⚔️', shield: '🛡️', axe: '🪓', pickaxe: '⛏️',
    bread: '🍞', potion: '🧪', rope: '🪢', cloth: '🧵',
  };
  const lower = (name || '').toLowerCase();
  for (const [key, icon] of Object.entries(icons)) {
    if (lower.includes(key)) return icon;
  }
  return '📦';
}
