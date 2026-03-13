import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = import.meta.env.DEV ? 'http://localhost:3001' : '/';
    const s = io(url, { transports: ['websocket'] });
    setSocket(s);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    return () => s.disconnect();
  }, []);

  return { socket, connected };
}
