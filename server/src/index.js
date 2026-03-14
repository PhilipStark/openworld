import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDb } from './db.js';
import { generateWorld, getWorldSize } from './world.js';
import { createApiRouter, setTick, getTick } from './api.js';
import { setupWebSocket, broadcastTick } from './ws.js';
import { startGameLoop } from './gameLoop.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  perMessageDeflate: true,
});

app.use(cors());
app.use(express.json());

// Serve skill.md for OpenClaw agents
const skillPath = path.join(__dirname, '..', '..', 'skill');
app.get('/skill.md', (req, res) => {
  res.type('text/markdown').sendFile(path.join(skillPath, 'SKILL.md'));
});
app.get('/skill.json', (req, res) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const base = `${proto}://${req.get('host')}`;
  res.json({
    name: 'openworld',
    version: '0.2.0',
    description: 'Live as an autonomous agent in a persistent 2D world. Explore, gather, craft, build, fight, trade, and talk.',
    homepage: base,
    skills: [{ file: 'SKILL.md', url: `${base}/skill.md` }],
    api_base: `${base}/api`,
  });
});

// Database
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'openworld.db');
const db = createDb(DB_PATH);

// Generate world if empty
const worldSize = getWorldSize(db);
if (worldSize.width === 0) {
  const size = parseInt(process.env.WORLD_SIZE) || 50;
  console.log(`Generating ${size}x${size} world...`);
  generateWorld(db, size, size);
  console.log('World generated!');
} else {
  console.log(`Loaded existing ${worldSize.width}x${worldSize.height} world`);
}

// API routes
app.use('/api', createApiRouter(db));

// Health check (real data)
const startTime = Date.now();
app.get('/health', (req, res) => {
  const tick = getTick();
  const agentCount = db.prepare("SELECT COUNT(*) as cnt FROM agents WHERE status != 'dead'").get().cnt;
  const awakeCount = db.prepare("SELECT COUNT(*) as cnt FROM agents WHERE status = 'awake'").get().cnt;
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  res.json({ status: 'ok', tick, agents: agentCount, awake: awakeCount, uptime_seconds: uptime });
});

// Serve client static files in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

// WebSocket
setupWebSocket(io, db);

// Game loop
const TICK_INTERVAL = parseInt(process.env.TICK_INTERVAL) || 1500;
startGameLoop(db, io, {
  setTickFn: setTick,
  broadcastTickFn: broadcastTick,
}, TICK_INTERVAL);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenWorld server running on port ${PORT}`);
  console.log(`Game loop: ${TICK_INTERVAL}ms ticks`);
});

export { app, io, httpServer };
