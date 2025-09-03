import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import i18n from 'i18next';
import { useTranslation, initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Initialize i18next
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en','hi','ta','bn','te','mr','gu','kn','ml','or','pa'],
    interpolation: { escapeValue: false },
    resources: {}
  });

const WS_URL = import.meta.env.VITE_WS_URL || 'wss://localhost:4000/ws';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const userIdKey = 'demo_user_id';

// Language Selector Component
function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const changeLanguage = (lng) => i18n.changeLanguage(lng);
  return (
    <select onChange={(e) => changeLanguage(e.target.value)} value={i18n.language}>
      {['en','hi','ta','bn','te','mr','gu','kn','ml','or','pa'].map(l => (
        <option key={l} value={l}>{l.toUpperCase()}</option>
      ))}
    </select>
  );
}

function Recenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
    }
  }, [lat, lng]);
  return null;
}

function Chatbot() {
  // Basic structure: could integrate BotUI or other 
  // Here just a placeholder to show how UI for chatbot fits
  // Real NLP backend integration would be next steps
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div style={{position:'fixed', bottom:80, right:20, width:300, height:400, background:'white', border:'1px solid #ccc', padding:10, zIndex:1000}}>
          <h4>{t('chat_help')}</h4>
          <div style={{flex:1}}>{/* Chat messages here */}</div>
          <button onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
      <button
        onClick={() => setOpen(true)}
        style={{
          position:'fixed',
          bottom:20,
          right:20,
          borderRadius:'50%',
          width:60,
          height:60,
          background:'#007bff',
          color:'white',
          border:'none',
          cursor:'pointer',
          fontSize:24,
          zIndex:1000
        }}
        aria-label={t('chat_help')}
      >💬</button>
    </>
  );
}

function App() {
  const { t } = useTranslation();
  const [userId, setUserId] = useState(localStorage.getItem(userIdKey) || '');
  const [pos, setPos] = useState({ lat: 28.6139, lng: 77.2090, acc: 50 });
  const [sharing, setSharing] = useState(false);
  const [sos, setSos] = useState(false);
  const wsRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    wsRef.current = new WebSocket(WS_URL);
    wsRef.current.onopen = () => console.log('WebSocket connected');
    wsRef.current.onclose = () => console.log('WebSocket disconnected');
    return () => wsRef.current?.close();
  }, [userId]);

  const register = async () => {
    const name = prompt(t('name'));
    if (!name) return;
    try {
      const response = await axios.post(`${API_URL}/api/register`, { name });
      const id = response.data.id;
      setUserId(id);
      localStorage.setItem(userIdKey, id);
    } catch {
      alert('Failed to register');
    }
  };

  const startSharing = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        const speed = pos.coords.speed;
        setPos({ lat, lng, acc });
        if (wsRef.current?.readyState === 1) {
          wsRef.current.send(
            JSON.stringify({ type: 'gps', user_id: userId, lat, lng, speed })
          );
        }
      },
      (err) => console.warn(err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    setSharing(true);
  };

  const stopSharing = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
  };

  const toggleSos = async () => {
    setSos(!sos);
    try {
      await axios.post(`${API_URL}/api/sos`, { user_id: userId, on: !sos });
    } catch {
      alert('Failed to toggle SOS');
    }
  };

  if (!userId) {
    return (
      <div style={{padding: 20}}>
        <h2>{t('register')}</h2>
        <button onClick={register}>{t('register')}</button>
      </div>
    );
  }

  const icon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl:
      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  });

  return (
    <>
      <header style={{display:'flex', justifyContent:'space-between', padding: '10px 20px', background: '#eee'}}>
        <div>
          <strong>Tourist Portal</strong> ({userId.slice(0, 8)}…)
        </div>
        <LanguageSelector />
      </header>
      <div style={{ padding: 20 }}>
        <MapContainer center={[pos.lat, pos.lng]} zoom={16} style={{height: 400}}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[pos.lat, pos.lng]} icon={icon} />
          <Circle center={[pos.lat, pos.lng]} radius={pos.acc} pathOptions={{ color: '#1368e8', fillOpacity: 0.15 }}/>
          <Recenter lat={pos.lat} lng={pos.lng} />
        </MapContainer>
        <div style={{ marginTop: 12 }}>
          {!sharing ? (
            <button onClick={startSharing}>{t('start_sharing')}</button>
          ) : (
            <button onClick={stopSharing}>{t('stop_sharing')}</button>
          )}
          <button onClick={toggleSos} style={{ marginLeft: 10 }}>
            {sos ? t('end_sos') : t('sos')}
          </button>
        </div>
      </div>
      <Chatbot />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
