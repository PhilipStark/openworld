import { useRef, useEffect } from 'react';

export default function WorldChat({ messages }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="p-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">World Chat</h3>
      <div className="space-y-1">
        {messages.length === 0 && <p className="text-xs text-gray-600">No messages yet...</p>}
        {messages.map((msg, i) => (
          <div key={i} className="text-xs">
            <span className="text-cyan-400 font-medium">[{msg.from}]</span>{' '}
            <span className="text-gray-300">{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
