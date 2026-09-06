export interface TrafficIncident {
  label: string;
  type: string;
  lat: number | null;
  lng: number | null;
  distKm: string | null;
  name: string | null;
}

export interface TrafficRoute {
  name: string;
  distKm: string;
  durMin: number;
  speedKmh: number;
  congestion: string;
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
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parseOverpassElements(elements: any[], userLat: number, userLng: number): TrafficIncident[] {
  const incidents: TrafficIncident[] = [];

  for (const el of elements) {
    if (!el.tags) continue;

    // Calculate distance from user to this element
    const elLat = el.lat || el.center?.lat || null;
    const elLng = el.lon || el.center?.lon || null;
    const distKm = elLat && elLng
      ? haversineKm(userLat, userLng, elLat, elLng)
      : null;

    let label = null;
    let type  = 'info';

    const t = el.tags;
    if (t['highway'] === 'speed_camera')       { label = '📷 Speed Camera';            type = 'warning'; }
    else if (t['amenity'] === 'police')        { label = '👮 Police Post';             type = 'warning'; }
    else if (t['hazard'])                      { label = `⚠️ Hazard: ${t['hazard']}`; type = 'danger';  }
    else if (t['highway'] === 'construction')  { label = '🚧 Road Work / Construction'; type = 'warning'; }
    else if (t['barrier'] === 'toll_booth')    { label = '💳 Toll Booth';              type = 'info';    }
    else if (t['flood_prone'] === 'yes')       { label = '🌊 Flood Prone Road';        type = 'danger';  }
    else if (t['surface'] === 'unpaved')       { label = '🪨 Unpaved Road Ahead';      type = 'info';    }
    else if (t['traffic_calming'])             { label = `🔴 Speed Bump (${t['traffic_calming']})`; type = 'info'; }

    if (label) {
      incidents.push({
        label,
        type,
        lat: elLat,
        lng: elLng,
        distKm: distKm ? distKm.toFixed(1) : null,
        name: t.name || t['name:en'] || null,
      });
    }
  }

  // Sort by distance — closest first
  return incidents.sort((a, b) => (parseFloat(a.distKm || "99")) - (parseFloat(b.distKm || "99")));
}

async function fetchOverpassTraffic(lat: number, lng: number): Promise<TrafficIncident[]> {
  const RADIUS_METERS = 2500; // 2.5 km around user

  const query = `
    [out:json][timeout:20];
    (
      node["highway"="speed_camera"](around:${RADIUS_METERS},${lat},${lng});
      node["hazard"](around:${RADIUS_METERS},${lat},${lng});
      node["amenity"="police"](around:${RADIUS_METERS},${lat},${lng});
      node["traffic_calming"](around:${RADIUS_METERS},${lat},${lng});
      way["highway"="construction"](around:${RADIUS_METERS},${lat},${lng});
      node["barrier"="toll_booth"](around:${RADIUS_METERS},${lat},${lng});
      way["barrier"="toll_booth"](around:${RADIUS_METERS},${lat},${lng});
      node["flood_prone"="yes"](around:${RADIUS_METERS},${lat},${lng});
      way["surface"="unpaved"](around:${RADIUS_METERS},${lat},${lng});
    );
    out body;
    >;
    out skel qt;
  `;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query)
  });

  const data = await res.json();
  return parseOverpassElements(data.elements, lat, lng);
}

async function fetchOSRMTraffic(lat: number, lng: number): Promise<TrafficRoute[]> {
  // Create 3 short route segments radiating from user position
  const probes = [
    { name: 'North road',  dlat: lat + 0.018, dlng: lng + 0.000 },
    { name: 'East road',   dlat: lat + 0.000, dlng: lng + 0.022 },
    { name: 'South road',  dlat: lat - 0.018, dlng: lng + 0.000 },
  ];

  const results = await Promise.allSettled(probes.map(async (p) => {
    const url = `https://router.project-osrm.org/route/v1/driving/` +
      `${lng},${lat};${p.dlng},${p.dlat}` +
      `?overview=false&steps=false`;
    const res = await fetch(url);
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;

    const distKm     = (route.distance / 1000).toFixed(1);
    const durMin     = Math.round(route.duration / 60);
    const speedKmh   = Math.round((route.distance / 1000) / ((route.duration || 1) / 3600));

    // Classify congestion by computed speed
    let congestion = 'Low';
    if (speedKmh < 15)      congestion = 'High';
    else if (speedKmh < 30) congestion = 'Moderate';

    return { name: p.name, distKm, durMin, speedKmh, congestion };
  }));

  return results
    .filter((r): r is PromiseFulfilledResult<TrafficRoute> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

async function resolveLocationName(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse` +
    `?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`;

  const res  = await fetch(url, {
    headers: { 'Accept-Language': 'en' }   // force English results
  });
  const data = await res.json();
  const addr = data.address || {};

  // Build name from SPECIFIC fields — NEVER use display_name or ward
  const road = addr.road || addr.pedestrian || addr.path || null;
  const area = addr.suburb || addr.neighbourhood || addr.village || null;
  const city = addr.city || addr.town || addr.county || null;

  if (road && city)  return `${road}, ${city}`;
  if (area && city)  return `${area}, ${city}`;
  if (city)          return city;
  return `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`; // raw fallback
}

let lastSuccessfulIncidents: TrafficIncident[] | null = null;
let lastSuccessfulRoutes: TrafficRoute[] | null = null;
let currentCongestionLevel: 'Low' | 'Moderate' | 'High' = 'Low';
let latchUntil = 0;

export const fetchLiveTrafficData = async (lat: number, lng: number): Promise<TrafficUpdate> => {
  // Step 1: Validate coordinates are real
  if (!lat || !lng || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return {
      error: 'Invalid coordinates. Please enable GPS and try again.',
      location: 'Unknown Location',
      lat: 0,
      lng: 0,
      trafficPresent: false,
      congestionLevel: 'Low',
      incidents: [],
      routes: [],
      fetchedAt: new Date().toLocaleTimeString(),
      radius: ''
    };
  }

  // Step 2: Run all 3 APIs in parallel — one failure must not block others
  const [overpassResult, osrmResult, locationResult] = await Promise.allSettled([
    fetchOverpassTraffic(lat, lng),
    fetchOSRMTraffic(lat, lng),
    resolveLocationName(lat, lng),
  ]);

  // Use new data if successful, otherwise fallback to last known good data
  const incidents = overpassResult.status === 'fulfilled' ? overpassResult.value : (lastSuccessfulIncidents || []);
  const routes    = osrmResult.status === 'fulfilled' ? osrmResult.value : (lastSuccessfulRoutes || []);
  const location  = locationResult.status === 'fulfilled' ? locationResult.value : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  if (overpassResult.status === 'fulfilled') lastSuccessfulIncidents = overpassResult.value;
  if (osrmResult.status === 'fulfilled') lastSuccessfulRoutes = osrmResult.value;

  // Step 3: Determine overall congestion level
  const highCount     = routes.filter(r => r.congestion === 'High').length;
  const moderateCount = routes.filter(r => r.congestion === 'Moderate').length;

  let rawCongestion: 'Low' | 'Moderate' | 'High' = 'Low';
  if (highCount >= 2 || incidents.length >= 4)           rawCongestion = 'High';
  else if (moderateCount >= 1 || incidents.length >= 2)  rawCongestion = 'Moderate';

  const now = Date.now();
  
  // Robust status-latching mechanism to prevent UI flickering between Low and High states
  if (rawCongestion === 'High') {
      currentCongestionLevel = 'High';
      latchUntil = now + (3 * 60 * 1000); // Latch High for 3 mins
  } else if (rawCongestion === 'Moderate') {
      if (currentCongestionLevel === 'High' && now < latchUntil) {
          // Keep latched at High
      } else {
          currentCongestionLevel = 'Moderate';
          latchUntil = now + (3 * 60 * 1000); // Latch Moderate for 3 mins
      }
  } else {
      if (now >= latchUntil) {
          currentCongestionLevel = 'Low';
      }
  }

  // Step 4: Build traffic present/absent verdict for the UI
  const trafficPresent = currentCongestionLevel !== 'Low' || incidents.length > 0;

  const result: TrafficUpdate = {
    location,          // e.g. "NH66, Udupi"
    lat,
    lng,
    trafficPresent,    // true = traffic/incidents found within 2–3 km
    congestionLevel: currentCongestionLevel,   // "Low" | "Moderate" | "High"
    incidents,         // array of nearby hazards, construction, police etc.
    routes,            // OSRM speed estimates for nearby roads
    fetchedAt: new Date().toLocaleTimeString(),
    radius: '2.5 km',
  };

  if (overpassResult.status === 'rejected' && osrmResult.status === 'rejected') {
     result.error = "Unstable connection to traffic APIs. Displaying latest known consensus data.";
  }

  (window as any)._liveTrafficData = result;

  return result;
};
