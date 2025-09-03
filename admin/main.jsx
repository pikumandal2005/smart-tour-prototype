import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';

const WS_URL = import.meta.env.VITE_WS_URL || 'wss://localhost:4000/ws';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const iconBlue = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:[25,41], iconAnchor:[12,41]
});

function KPIs() {
  const [kpis, setKpis] = useState({});
  useEffect(() => {
    const load = async () => {
      try {
        const r = await axios.get(`${API_URL}/api/admin/kpis`);
        setKpis(r.data);
      } catch {}
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div><strong>Total:</strong> {kpis.total_tourists || 0}</div>
      <div><strong>Active:</strong> {kpis.active_tourists || 0}</div>
      <div><strong>Incidents:</strong> {kpis.incident_trends?.high || 0}</div>
    </div>
  );
}

function AdminApp() {
  const [positions, setPositions] = useState(new Map());
  const [alerts, setAlerts] = useState([]);
  const alertsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (ev) => {
      const { channel, data } = JSON.parse(ev.data);
      if(channel === 'gps') {
        setPositions(prev => new Map(prev).set(data.user_id, data));
      } else if(channel === 'alerts') {
        setAlerts(prev => [data, ...prev].slice(0,50));
      }
    };
    return () => ws.close();
  }, []);

  return (
    <>
      <h2>Authority Dashboard</h2>
      <KPIs />
      <MapContainer center={[28.6139, 77.209]} zoom={13} style={{ height: '400px' }}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {[...positions.values()].map(p => (
          <Marker key={p.user_id} position={[p.lat, p.lng]} icon={iconBlue}>
            <Popup>
              <div>User: {p.user_id.slice(0,8)}</div>
              <div>Speed: {p.speed || 'N/A'}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div>
        <h3>Alerts & Incidents</h3>
        <ul>
          {alerts.map(a => (
            <li key={a.ts}>{a.kind} - User: {a.user_id?.slice(0,8)} - {a.reason || a.text || ''}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')).render(<AdminApp />);
