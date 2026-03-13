export default function TopBar({ viewers, agentCount, tick, connected }) {
  const day = Math.floor(tick / 2400) + 1;
  const timeOfDay = (tick % 2400);
  const isNight = timeOfDay >= 1200;

  const timeIcon = isNight ? '🌙' : '☀️';
  const timeLabel = isNight ? 'Night' : 'Day';

  // Time progress within day cycle (0-100%)
  const dayProgress = timeOfDay < 1200
    ? Math.floor((timeOfDay / 1200) * 100)
    : Math.floor(((timeOfDay - 1200) / 1200) * 100);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800 select-none">
      <div className="flex items-center gap-2">
        <span className="text-base font-bold tracking-widest text-amber-400" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '11px' }}>
          OPENWORLD
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
          connected
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          {connected ? '● LIVE' : '○ OFFLINE'}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <span>{timeIcon}</span>
          <span>{timeLabel}</span>
          <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden ml-1">
            <div
              className={`h-full rounded-full transition-all ${isNight ? 'bg-indigo-500' : 'bg-amber-400'}`}
              style={{ width: `${dayProgress}%` }}
            />
          </div>
        </div>
        <span className="text-gray-600">|</span>
        <span>Day {day}</span>
        <span className="text-gray-600">|</span>
        <span className="tabular-nums">Tick {tick}</span>
        <span className="text-gray-600">|</span>
        <span>👤 {agentCount}</span>
        <span>👁 {viewers}</span>
      </div>
    </div>
  );
}
