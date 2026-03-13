import { getAgentByToken } from './agent.js';

export function authMiddleware(db) {
  return (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Missing Bearer token' });
    }
    const token = auth.slice(7);
    const agent = getAgentByToken(db, token);
    if (!agent) {
      return res.status(401).json({ ok: false, error: 'invalid_token', message: 'Invalid token' });
    }
    req.agent = agent;
    next();
  };
}

const rateLimitMap = new Map();

export function rateLimiter(tickInterval = 1500) {
  return (req, res, next) => {
    const agentId = req.agent?.id;
    if (!agentId) return next();

    const now = Date.now();
    const last = rateLimitMap.get(agentId) || 0;
    if (now - last < tickInterval) {
      const wait = tickInterval - (now - last);
      return res.status(429).json({ ok: false, error: 'rate_limited', message: `1 action per tick. Next tick in ${wait}ms` });
    }
    rateLimitMap.set(agentId, now);
    next();
  };
}
