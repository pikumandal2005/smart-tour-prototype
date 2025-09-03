import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { WebSocketServer } from 'ws';
import url from 'url';
import { nanoid } from 'nanoid';
import fetch from 'node-fetch';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

const AI_ANOMALY_URL = process.env.AI_ANOMALY_URL || 'http://localhost:5001/detect_anomaly';
const AI_GEOFENCE_URL = process.env.AI_GEOFENCE_URL || 'http://localhost:5003/get_updated_geofences';
const AI_NLP_URL = process.env.AI_NLP_URL || 'http://localhost:5002/classify_incident';
const AI_ANALYTICS_URL = process.env.AI_ANALYTICS_URL || 'http://localhost:5004/summary';

// In-memory stores
const users = new Map();
const locations = new Map();
const events = [];
let fences = [];

// Seed demo user & initial fence load
const demoUserId = nanoid();
users.set(demoUserId, { id: demoUserId, name: 'Demo Tourist', role: 'tourist', created_at: new Date().toISOString() });

async function updateFences() {
  try {
    const resp = await fetch(AI_GEOFENCE_URL);
    if (resp.ok) fences = await resp.json();
  } catch (e) {
    console.error('Failed to update fences:', e);
  }
}

await updateFences();

// Schedule fence update every 1 hour (3600000)
setInterval(updateFences, 3600000);

app.get('/health', (req, res) => {
  res.json({ok:true, users: users.size, fences: fences.length, demo_user_id: demoUserId});
});

app.get('/api/fences', (req, res) => {
  res.json(fences);
});

app.get('/api/user/:id/last', (req, res) => {
  const loc = locations.get(req.params.id) || null;
  if (!loc) return res.json(null);
  res.json({
    ts: new Date(loc.ts).toISOString(),
    geom: { type: 'Point', coordinates: [loc.lng, loc.lat] },
    speed: loc.speed ?? null
  });
});

// Register new user
app.post('/api/register', (req, res) => {
  const { name, phone } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ok:false, error:'Name required'});
  const id = nanoid();
  const user = { id, name: name.trim(), phone: phone?.trim() || null, role: 'tourist', created_at: new Date().toISOString() };
  users.set(id, user);
  res.json({ ok:true, id, user });
});

// SOS
app.post('/api/sos', (req, res) => {
  const { user_id, on } = req.body;
  const ev = { id: nanoid(), user_id, type: 'sos', severity: on ? 'high' : 'info', ts: new Date().toISOString(), details: { on } };
  events.unshift(ev);
  broadcast({ channel: 'alerts', data: { kind: 'sos', user_id, on, ts: ev.ts } });
  res.json({ ok: true });
});

// NLP incident classification endpoint
app.post('/api/incidents', async (req, res) => {
  const { text, user_id } = req.body;
  if (!text || !user_id) return res.status(400).json({ ok: false, error: 'Missing text or user_id' });

  try {
    const r = await fetch(AI_NLP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const j = await r.json();
    const ev = {
      id: nanoid(),
      user_id,
      type: 'incident',
      severity: j.severity || 'low',
      ts: new Date().toISOString(),
      details: { text, classification: j }
    };
    events.unshift(ev);
    broadcast({ channel: 'alerts', data: { kind: 'incident', user_id, severity: ev.severity, text, ts: ev.ts } });
    res.json({ ok: true, severity: j.severity });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'NLP service error' });
  }
});

// Admin KPI
app.get('/api/admin/kpis', async (req, res) => {
  try {
    const r = await fetch(AI_ANALYTICS_URL + '/summary');
    if (!r.ok) throw new Error('Failed analytics fetch');
    const analytics = await r.json();
    res.json({
      generated_at: new Date().toISOString(),
      ...analytics
    });
  } catch (e) {
    res.status(500).json({ error: 'Analytics error' });
  }
});

// Admin lists
app.get('/api/admin/tourists', (req, res) => {
  const rows = [...users.values()].map(u => ({
    id: u.id,
    name: u.name,
    created_at: u.created_at,
    last_ts: locations.get(u.id)?.ts ? new Date(locations.get(u.id).ts).toISOString() : null
  })).sort((a, b) => (b.last_ts || b.created_at).localeCompare(a.last_ts || a.created_at)).slice(0, 200);
  res.json(rows);
});

app.get('/api/admin/alerts', (req, res) => {
  res.json(events.slice(0, 200));
});

// In-memory point in polygon check (ray casting)
function pointInPolygonLL(lat, lng, poly) {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const lat_i = poly[i][0], lon_i = poly[i][1];
    const lat_j = poly[j][0], lon_j = poly[j][1];
    const intersect = ((lon_i > lng) !== (lon_j > lng)) &&
                      (lat < (lat_j - lat_i) * (lng - lon_i) / ((lon_j - lon_i) || 1e-12) + lat_i);
    if (intersect) odd = !odd;
  }
  return odd;
}

const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

const lastSpeedByUser = new Map();

const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  const { pathname } = url.parse(req.url);
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

wss.on('connection', ws => {
  clients.add(ws);

  ws.on('close', () => clients.delete(ws));

  ws.on('message', async msg => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === 'gps') {

        const { user_id, lat, lng, speed } = data;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const ts = Date.now();

        locations.set(user_id, { lat, lng, ts, speed: speed ?? null });

        // Call AI anomaly detection service
        const prevSpeed = lastSpeedByUser.get(user_id) || 0;
        let anomalyReason = null;

        try {
          const r = await fetch(AI_ANOMALY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng, speed, prev_speed: prevSpeed })
          });
          const j = await r.json();
          if (j.anomaly) anomalyReason = j.reason;
        } catch (e) {
          console.error('Anomaly detection error:', e);
        }

        lastSpeedByUser.set(user_id, speed);

        // Geofence detection
        const hitFences = fences.filter(f => pointInPolygonLL(lat, lng, f.polygon));

        broadcast({
          channel: 'gps',
          data: { kind: 'pos', user_id, lat, lng, speed, fences: hitFences.map(f => f.id), ts }
        });

        if (hitFences.length > 0) {
          const ev = {
            id: nanoid(),
            user_id,
            type: 'enter',
            severity: 'warn',
            ts: new Date().toISOString(),
            details: { fence_ids: hitFences.map(f => f.id) }
          };
          events.unshift(ev);
          broadcast({
            channel: 'alerts',
            data: { kind: 'enter', user_id, fences: hitFences.map(f => ({ id: f.id, name: f.name, risk_level: f.risk_level })), ts: ev.ts }
          });
        }

        if (anomalyReason) {
          const ev = {
            id: nanoid(),
            user_id,
            type: 'anomaly',
            severity: 'high',
            ts: new Date().toISOString(),
            details: { reason: anomalyReason }
          };
          events.unshift(ev);
          broadcast({
            channel: 'alerts',
            data: { kind: 'anomaly', user_id, reason: anomalyReason, ts: ev.ts }
          });
        }

      }

    } catch (e) {
      console.error('WS error', e);
    }
  });
});

function broadcast(obj) {
  const payload = JSON.stringify(obj);
  for (const c of clients) {
    try {
      c.send(payload);
    } catch {}
  }
}

server.listen(PORT, () => console.log(`Server listening on port ${PORT}, Demo user id: ${demoUserId}`));
