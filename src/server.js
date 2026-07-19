// ORION — Main Server
// Express REST API + WebSocket server for real-time GPS updates
require('dotenv').config();
const path = require('path');

const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  console.warn("Could not set custom DNS servers:", e);
}

const express = require('express');
const http = require('http');
const cors = require('cors');
const url = require('url');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const data = require('./data');
const { tick } = require('./simulator');

const PORT = process.env.PORT || 3000;

// ── Express App ─────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── Serve Web Companion Dashboard (static files) ─────────────
// On Render: web/ is at backend/web/ (copied into the backend repo)
// On local dev: web/ is at ../../web (project root)
const fs = require('fs');
const WEB_DIR_INSIDE = path.join(__dirname, '../web');
const WEB_DIR_OUTSIDE = path.join(__dirname, '../../web');
const WEB_DIR = fs.existsSync(WEB_DIR_INSIDE) ? WEB_DIR_INSIDE : WEB_DIR_OUTSIDE;
console.log(`[WEB] Serving dashboard from: ${WEB_DIR}`);
app.use(express.static(WEB_DIR));

// ── Auth middleware ──────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !data.sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.userId = data.sessions.get(token);
  next();
}

const userResponse = (user) => ({
  id: user._id?.toString() || user.id,
  email: user.email,
  name: user.name,
  profile: user.profile || {},
  preferences: user.preferences || {}
});

// ── Auth Routes ─────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password required' });
  }
  try {
    const user = await data.registerUser(name, email, password);
    const token = uuidv4();
    data.sessions.set(token, user.id || user._id?.toString());
    res.status(201).json({ token, user: userResponse(user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = uuidv4();
  data.sessions.set(token, user.id);
  res.json({ token, user: userResponse(user) });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  data.sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = data.users.find(u => (u._id?.toString() || u.id) === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(userResponse(user));
});

// ── User Profile & Preferences Routes ───────────────────────
app.get('/api/user/profile', authMiddleware, (req, res) => {
  const user = data.users.find(u => (u._id?.toString() || u.id) === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    profile: user.profile || {},
    preferences: user.preferences || {}
  });
});

app.patch('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const updatedUser = await data.updateUserProfile(req.userId, req.body);
    res.json(userResponse(updatedUser));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/user/settings', authMiddleware, async (req, res) => {
  try {
    const updatedUser = await data.updateUserPreferences(req.userId, req.body);
    res.json(userResponse(updatedUser));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Asset Routes ────────────────────────────────────────────
app.get('/api/assets', authMiddleware, (req, res) => {
  const userAssets = data.assets.filter(a => a.userId.toString() === req.userId.toString());
  res.json(userAssets);
});

app.get('/api/assets/:id', authMiddleware, (req, res) => {
  const asset = data.assets.find(a => a.id === req.params.id && a.userId.toString() === req.userId.toString());
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  res.json(asset);
});

app.post('/api/assets', authMiddleware, async (req, res) => {
  const { name, category } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'name and category required' });
  }
  const valid = ['vehicle', 'freight', 'person', 'equipment'];
  if (!valid.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${valid.join(', ')}` });
  }
  try {
    const asset = await data.addAsset(name, category, req.userId);
    res.status(201).json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/assets/:id/tracking', authMiddleware, async (req, res) => {
  const { trackingSource } = req.body;
  if (!trackingSource || !['simulation', 'device'].includes(trackingSource)) {
    return res.status(400).json({ error: 'trackingSource must be simulation or device' });
  }
  try {
    const asset = await data.updateAssetTrackingSource(req.params.id, trackingSource, req.userId);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assets/:id/location', authMiddleware, async (req, res) => {
  try {
    const asset = await data.updateAssetLocation(req.params.id, req.body, req.userId);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/assets/:id', authMiddleware, async (req, res) => {
  try {
    const removed = await data.removeAsset(req.params.id, req.userId);
    if (!removed) return res.status(404).json({ error: 'Asset not found' });
    res.json({ ok: true, removed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assets/trigger-panic', authMiddleware, async (req, res) => {
  try {
    const asset = data.assets.find(
      a => a.userId.toString() === req.userId.toString() && a.trackingSource === 'simulation'
    );
    if (!asset) return res.status(404).json({ error: 'No simulated assets found to trigger panic' });

    // Force speed above 70 km/h threshold and move coordinates ~5km away to trigger geofence breach
    asset.speed = 92.4;
    asset.position.lat += 0.045;
    asset.position.lng += 0.045;
    asset.status = 'active';
    asset.lastUpdate = Date.now();

    const updated = await data.updateAssetLocation(asset.id, {
      lat: asset.position.lat,
      lng: asset.position.lng,
      speed: asset.speed,
      heading: asset.heading,
      battery: asset.battery
    }, req.userId);

    // Delay the geofence breach alert and WebSocket broadcast by exactly 10 seconds for presentation effect!
    setTimeout(async () => {
      try {
        // Instantly create the alert
        const alertMsg = `CRITICAL GEOFENCE BREACH: ${asset.name} left "HQ Perimeter" zone (speed: 92 km/h)`;
        const alert = await data.addAlert(asset.id, asset.name, 'geofence_breach', 'critical', alertMsg, req.userId);

        // Broadcast update immediately to all connected sockets
        broadcast({
          type: 'update',
          assets: data.assets.map(a => ({
            id: a.id,
            name: a.name,
            category: a.category,
            status: a.status,
            battery: Math.round(a.battery * 10) / 10,
            position: a.position,
            speed: Math.round(a.speed * 10) / 10,
            heading: Math.round(a.heading),
            trackingSource: a.trackingSource || 'simulation',
            lastUpdate: a.lastUpdate
          })),
          newAlerts: [alert],
          timestamp: Date.now()
        });
        console.log(`[PANIC] Delayed alert broadcasted successfully for ${asset.name}`);
      } catch (err) {
        console.error('[PANIC] Failed to broadcast delayed alert:', err);
      }
    }, 10000);

    res.json({ ok: true, triggeredAsset: updated.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alert Routes ────────────────────────────────────────────
app.get('/api/alerts', authMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const userAlerts = data.alerts.filter(a => a.userId.toString() === req.userId.toString());
  res.json(userAlerts.slice(0, limit));
});

// ── Geofence Routes ─────────────────────────────────────────
app.get('/api/geofences', authMiddleware, (req, res) => {
  const userGeofences = data.geofences.filter(gf => gf.userId.toString() === req.userId.toString());
  res.json(userGeofences);
});

// ── Dashboard Summary ───────────────────────────────────────
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const userAssets = data.assets.filter(a => a.userId.toString() === req.userId.toString());
  const userAlerts = data.alerts.filter(a => a.userId.toString() === req.userId.toString());

  const activeCount = userAssets.filter(a => a.status === 'active').length;
  const alertCount = userAlerts.filter(a => Date.now() - a.timestamp < 86400000).length;
  const avgBattery = userAssets.length > 0
    ? Math.round(userAssets.reduce((s, a) => s + a.battery, 0) / userAssets.length)
    : 0;
  res.json({
    totalAssets: userAssets.length,
    activeTrackers: activeCount,
    alertsToday: alertCount,
    avgBattery,
    recentAlerts: userAlerts.slice(0, 10),
    assets: userAssets
  });
});

// ── Health ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), assets: data.assets.length });
});

// ── SPA Catch-all (must be AFTER all /api routes) ────────────
// Returns index.html for any non-API GET — enables hash routing
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(WEB_DIR, 'index.html'));
  }
});

// ── HTTP + WebSocket Server ─────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const parameters = url.parse(req.url, true).query;
  const token = parameters.token;

  if (!token || !data.sessions.has(token)) {
    console.log(`[WS] Connection rejected: Invalid or missing token`);
    ws.close(4001, 'Unauthorized');
    return;
  }

  const userId = data.sessions.get(token);
  ws.userId = userId;

  console.log(`[WS] Client authenticated for user ${userId} (${wss.clients.size} total)`);

  const userAssets = data.assets.filter(a => a.userId.toString() === userId.toString());
  const userGeofences = data.geofences.filter(gf => gf.userId.toString() === userId.toString());
  const userAlerts = data.alerts.filter(a => a.userId.toString() === userId.toString());

  // Send initial full state
  ws.send(JSON.stringify({
    type: 'init',
    assets: userAssets,
    geofences: userGeofences,
    alerts: userAlerts.slice(0, 20)
  }));

  ws.on('close', () => {
    console.log(`[WS] Client disconnected (${wss.clients.size} total)`);
  });
});

// Broadcast to all connected clients, filtered by client's userId
function broadcast(message) {
  if (message.type === 'update') {
    for (const client of wss.clients) {
      if (client.readyState === 1 && client.userId) { // OPEN and authenticated
        const userId = client.userId.toString();
        const clientAssets = message.assets.filter(a => {
          const original = data.assets.find(orig => orig.id === a.id);
          return original && original.userId.toString() === userId;
        });

        const clientAlerts = message.newAlerts.filter(a => a.userId.toString() === userId);

        client.send(JSON.stringify({
          type: 'update',
          assets: clientAssets,
          newAlerts: clientAlerts,
          timestamp: message.timestamp
        }));
      }
    }
  } else {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  }
}

// ── Simulation Loop ─────────────────────────────────────────
const TICK_INTERVAL = 1500; // 1.5 seconds

setInterval(() => {
  const newAlerts = tick();

  broadcast({
    type: 'update',
    assets: data.assets.map(a => ({
      id: a.id,
      name: a.name,
      category: a.category,
      status: a.status,
      battery: Math.round(a.battery * 10) / 10,
      position: a.position,
      speed: Math.round(a.speed * 10) / 10,
      heading: Math.round(a.heading),
      trackingSource: a.trackingSource || 'simulation',
      lastUpdate: a.lastUpdate
    })),
    newAlerts,
    timestamp: Date.now()
  });
}, TICK_INTERVAL);

// ── Start ───────────────────────────────────────────────────
const startServer = async () => {
  try {
    await data.initDB();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  ╔══════════════════════════════════════╗`);
      console.log(`  ║   ORION Backend — Port ${PORT}          ║`);
      console.log(`  ║   REST:  http://0.0.0.0:${PORT}/api     ║`);
      console.log(`  ║   WS:    ws://0.0.0.0:${PORT}           ║`);
      console.log(`  ║   Assets: ${data.assets.length} tracked              ║`);
      console.log(`  ╚══════════════════════════════════════╝\n`);
    });
  } catch (err) {
    console.error("Database connection failed. Server not started:", err);
    process.exit(1);
  }
};

startServer();
