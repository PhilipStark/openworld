import { useRef, useEffect } from 'react';

const ACTION_PATTERNS = [
  { pattern: /attack|hit|damage|kill|died|combat|fight/i, color: 'text-red-400', icon: '⚔️' },
  { pattern: /trade|buy|sell|offer|accept/i, color: 'text-amber-400', icon: '🤝' },
  { pattern: /craft|build|place|create/i, color: 'text-blue-400', icon: '🔨' },
  { pattern: /gather|mine|chop|fish|harvest/i, color: 'text-green-400', icon: '⛏️' },
  { pattern: /sleep|rest|wake/i, color: 'text-indigo-400', icon: '💤' },
  { pattern: /eat|drink|heal|potion/i, color: 'text-pink-400', icon: '🧪' },
];

function getMessageStyle(text) {
  for (const { pattern, color, icon } of ACTION_PATTERNS) {
    if (pattern.test(text)) return { color, icon };
  }
  return { color: 'text-gray-400', icon: '💬' };
}

export default function WorldChat({ messages }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [messages]);

  return (
    <div className="px-3 py-2">
      <div ref={scrollRef} className="space-y-0.5 max-h-40 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-[11px] text-gray-700 italic">The world is quiet...</p>
        )}
        {messages.map((msg, i) => {
          const style = getMessageStyle(msg.text || '');
          return (
            <div key={i} className="text-[11px] leading-relaxed flex items-start gap-1">
              <span className="opacity-60 flex-shrink-0" style={{ fontSize: '9px' }}>{style.icon}</span>
              <span>
                <span className="text-cyan-300 font-medium">{msg.from}</span>
                <span className="text-gray-600 mx-1">»</span>
                <span className={style.color}>{msg.text}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
