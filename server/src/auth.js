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
const ipRateLimitMap = new Map();

export function ipRateLimiter({ windowMs = 60000, maxRequests = 5 } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = ipRateLimitMap.get(ip);

    if (!entry || now - entry.start > windowMs) {
      ipRateLimitMap.set(ip, { start: now, count: 1 });
      return next();
    }

    entry.count++;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.start + windowMs - now) / 1000);
      return res.status(429).json({
        ok: false,
        error: 'rate_limited',
        message: `Too many requests. Try again in ${retryAfter}s`,
      });
    }
    next();
  };
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipRateLimitMap) {
    if (now - entry.start > 300000) ipRateLimitMap.delete(ip);
  }
}, 300000);

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
