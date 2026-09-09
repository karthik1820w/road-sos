import { getSocket } from './incidentService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrafficIncident {
  label: string;
  type: string;
  lat: number | null;
  lng: number | null;
  distKm: string | null;
  name: string | null;
  source: 'static' | 'crowd' | 'weather';
  confirmCount?: number;
  id?: string;
}

export interface TrafficRoute {
  name: string;
  distKm: string;
  durMin: number;
  speedKmh: number;
  congestion: string;
  dataSource: 'live' | 'estimated';
}

export interface TrafficUpdate {
  location: string;
  lat: number;
  lng: number;
  trafficPresent: boolean;
  congestionLevel: 'Low' | 'Moderate' | 'High';
  incidents: TrafficIncident[];
  routes: TrafficRoute[];
  fetchedAt: string;
  radius: string;
  error?: string;
  updateSource: 'socket' | 'poll';
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function resolveLocationName(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    const addr = data.address || {};
    const road = addr.road || addr.pedestrian || addr.path || null;
    const area = addr.suburb || addr.neighbourhood || addr.village || null;
    const city = addr.city || addr.town || addr.county || null;
    if (road && city) return `${road}, ${city}`;
    if (area && city) return `${area}, ${city}`;
    if (city) return city;
  } catch { /* fallback below */ }
  return `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;
}

// ---------------------------------------------------------------------------
// Congestion latching (prevents UI flickering)
// ---------------------------------------------------------------------------

let currentCongestionLevel: 'Low' | 'Moderate' | 'High' = 'Low';
let latchUntil = 0;

// ---------------------------------------------------------------------------
// Session ID (per-trip, anonymous, rotated on driving start)
// ---------------------------------------------------------------------------

export function getTrafficSessionId(): string {
  let id = sessionStorage.getItem('traffic_session_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('traffic_session_id', id);
  }
  return id;
}

export function rotateTrafficSessionId(): string {
  const id = crypto.randomUUID();
  sessionStorage.setItem('traffic_session_id', id);
  return id;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export const fetchLiveTrafficData = async (lat: number, lng: number): Promise<TrafficUpdate> => {
  if (!lat || !lng || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return {
      error: 'Invalid coordinates. Please enable GPS and try again.',
      location: 'Unknown Location', lat: 0, lng: 0,
      trafficPresent: false, congestionLevel: 'Low',
      incidents: [], routes: [],
      fetchedAt: new Date().toLocaleTimeString(), radius: '', updateSource: 'poll',
    };
  }

  const [apiResult, locationResult] = await Promise.allSettled([
    fetch(`/api/traffic/overview?lat=${lat}&lng=${lng}&radiusKm=2.5`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
    resolveLocationName(lat, lng),
  ]);

  const location = locationResult.status === 'fulfilled' ? locationResult.value : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  if (apiResult.status === 'rejected') {
    return {
      error: 'Live routing unavailable. Self-hosted OSRM may be down.',
      location, lat, lng,
      trafficPresent: false, congestionLevel: 'Low',
      incidents: [], routes: [],
      fetchedAt: new Date().toLocaleTimeString(), radius: '2.5 km', updateSource: 'poll',
    };
  }

  const api = apiResult.value;
  const incidents: TrafficIncident[] = api.incidents || [];
  const routes: TrafficRoute[] = (api.routes || []).map((r: any) => ({
    ...r, dataSource: r.dataSource || 'estimated',
  }));

  // Congestion latching
  const rawCongestion = api.congestionLevel || 'Low';
  const now = Date.now();
  if (rawCongestion === 'High') {
    currentCongestionLevel = 'High';
    latchUntil = now + 3 * 60 * 1000;
  } else if (rawCongestion === 'Moderate') {
    if (!(currentCongestionLevel === 'High' && now < latchUntil)) {
      currentCongestionLevel = 'Moderate';
      latchUntil = now + 3 * 60 * 1000;
    }
  } else {
    if (now >= latchUntil) currentCongestionLevel = 'Low';
  }

  const trafficPresent = currentCongestionLevel !== 'Low' || incidents.length > 0;

  const result: TrafficUpdate = {
    location, lat, lng, trafficPresent,
    congestionLevel: currentCongestionLevel,
    incidents, routes,
    fetchedAt: new Date().toLocaleTimeString(),
    radius: api.radius || '2.5 km',
    updateSource: 'poll',
  };

  (window as any)._liveTrafficData = result;
  return result;
};

// ---------------------------------------------------------------------------
// Probe submission (fire-and-forget from driving mode)
// ---------------------------------------------------------------------------

export function submitTrafficProbe(
  lat: number, lng: number, speedKmh: number, headingDeg: number, sessionId: string,
) {
  fetch('/api/traffic/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, speedKmh, headingDeg, timestamp: Date.now(), sessionId }),
  }).catch(() => { /* fire-and-forget */ });
}

// ---------------------------------------------------------------------------
// Hazard reporting
// ---------------------------------------------------------------------------

export async function reportHazard(
  type: 'pothole' | 'accident' | 'police' | 'waterlogging' | 'roadblock',
  lat: number, lng: number, sessionId: string,
) {
  const res = await fetch('/api/traffic/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, lat, lng, sessionId }),
  });
  return res.json();
}

export async function confirmHazard(reportId: string) {
  const res = await fetch(`/api/traffic/report/${reportId}/confirm`, { method: 'POST' });
  return res.json();
}

export function applyTrafficSocketUpdate(
  current: TrafficUpdate | null,
  payload: { type: string; data: any }
): TrafficUpdate | null {
  if (!current) return null;

  const next = { ...current, updateSource: 'socket' as const, fetchedAt: new Date().toLocaleTimeString() };

  if (payload.type === 'new_report') {
    const report = payload.data;
    const distKm = haversineKm(current.lat, current.lng, report.lat, report.lng).toFixed(1);
    
    // Check if it's already in the list
    if (!next.incidents.some(i => i.id === report.id)) {
      const crowdIncident: TrafficIncident = {
        id: report.id,
        label: `🚨 ${report.type.charAt(0).toUpperCase() + report.type.slice(1)}`,
        type: report.type === 'accident' ? 'danger' : 'warning',
        source: 'crowd',
        lat: report.lat,
        lng: report.lng,
        distKm,
        name: null,
        confirmCount: report.confirm_count || 0
      };

      next.incidents = [...next.incidents, crowdIncident].sort(
        (a, b) => parseFloat(a.distKm || '99') - parseFloat(b.distKm || '99')
      );
    }
  } else if (payload.type === 'confirmed') {
    const updated = payload.data;
    next.incidents = next.incidents.map(inc => 
      inc.id === updated.id ? { ...inc, confirmCount: updated.confirm_count } : inc
    );
  } else if (payload.type === 'segments') {
    // We only recalculate local area live data congestion for simplicity here
    // as full OSRM route recalculation requires API calls. 
    // We update the data source and fetch full updates if we needed, but for now we'll 
    // just re-evaluate if it's high enough to trigger congestion.
    // The main fetchLiveTrafficData is expected to be called periodically or manually for full OSRM routing.
    // For now, let's just trigger updateSource: socket.
  } else if (payload.type === 'weather') {
    const weatherData = payload.data;
    // Remove old weather incidents
    next.incidents = next.incidents.filter(i => i.source !== 'weather');
    
    if (weatherData.isWet) {
      next.incidents.unshift({
        id: 'weather_wet',
        label: `🌧️ Wet Road Advisory`,
        type: 'warning',
        source: 'weather',
        lat: current.lat,
        lng: current.lng,
        distKm: '0.0',
        name: 'Local Area',
        confirmCount: 0
      });
    }
  }

  // Recalculate congestion
  const highRoutes = next.routes.filter(r => r.congestion === 'High').length;
  const modRoutes = next.routes.filter(r => r.congestion === 'Moderate').length;
  let congestionLevel: 'Low' | 'Moderate' | 'High' = 'Low';
  if (highRoutes >= 2 || next.incidents.filter(i => i.source === 'crowd').length >= 4) congestionLevel = 'High';
  else if (modRoutes >= 1 || next.incidents.length >= 2) congestionLevel = 'Moderate';
  next.congestionLevel = congestionLevel;
  next.trafficPresent = congestionLevel !== 'Low' || next.incidents.length > 0;

  return next;
}

// ---------------------------------------------------------------------------
// Socket.IO real-time subscription
// ---------------------------------------------------------------------------

export function subscribeToTrafficUpdates(
  lat: number, lng: number, radiusKm: number,
  onUpdate: (payload: { type: string; data: any }) => void,
): () => void {
  const socket = getSocket();
  socket.emit('traffic:subscribe', { lat, lng, radiusKm });

  const handler = (data: any) => onUpdate(data);
  socket.on('traffic:update', handler);

  const rejoin = () => socket.emit('traffic:subscribe', { lat, lng, radiusKm });
  socket.on('connect', rejoin);

  return () => {
    socket.off('traffic:update', handler);
    socket.off('connect', rejoin);
  };
}
