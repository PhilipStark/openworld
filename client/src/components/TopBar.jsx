export default function TopBar({ viewers, agentCount, tick, connected }) {
  const day = Math.floor(tick / 2400) + 1;
  const timeOfDay = (tick % 2400) < 1200 ? '☀️ Day' : '🌙 Night';

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tracking-wider">OPENWORLD</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>
      <div className="flex items-center gap-6 text-sm text-gray-400">
        <span>{timeOfDay}</span>
        <span>Day {day}</span>
        <span>Tick {tick}</span>
        <span>{agentCount} agents</span>
        <span>{viewers} viewers</span>
      </div>
    </div>
  );
}
