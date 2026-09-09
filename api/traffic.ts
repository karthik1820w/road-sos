import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import type { Server as SocketServer } from 'socket.io';
import type { SupabaseClient } from '@supabase/supabase-js';
import xss from 'xss';

export interface TrafficRouterDeps {
  supabase: SupabaseClient | null;
  io?: SocketServer;
}

interface AggregatedSegment {
  wayId: string;
  sumSpeed: number;
  sampleCount: number;
  windowStart: number;
  speeds: number[];
}

const ProbeSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speedKmh: z.number(),
  headingDeg: z.number().optional(),
  timestamp: z.number(),
  sessionId: z.string().min(1),
});

const ReportSchema = z.object({
  type: z.enum(['pothole', 'accident', 'police', 'waterlogging', 'roadblock']),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  sessionId: z.string().min(1),
});

const DEFAULT_FREEFLOW_SPEEDS: Record<string, number> = {
  motorway: 80, trunk: 60, primary: 50, secondary: 40,
  tertiary: 35, residential: 25, unclassified: 30,
};

const segmentAggregates = new Map<string, AggregatedSegment>();

const getGeoRoom = (lat: number, lng: number) =>
  `geo:${Math.floor(lat * 10)}:${Math.floor(lng * 10)}`;

const hashSession = (s: string) =>
  crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

const weatherCache = new Map<string, { data: any; timestamp: number }>();

export async function getWeatherForLocation(lat: number, lng: number, io?: SocketServer) {
  const gridKey = `weather:${Math.round(lat * 10)}:${Math.round(lng * 10)}`;
  const now = Date.now();
  const cached = weatherCache.get(gridKey);

  // Cache for 10 minutes
  if (cached && now - cached.timestamp < 10 * 60 * 1000) {
    return cached.data;
  }

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation&timezone=auto`);
    const data = await res.json();
    if (data && data.current) {
      const precip = data.current.precipitation || 0;
      // Heuristic: > 1.5mm/hr precipitation means roads are significantly wet
      const isWet = precip > 1.5;
      
      const parsedData = {
        temperature: data.current.temperature_2m,
        humidity: data.current.relative_humidity_2m,
        precipitation: precip,
        isWet,
        summary: `Current temperature is ${data.current.temperature_2m}°C, humidity is ${data.current.relative_humidity_2m}%, precipitation is ${precip}mm.`
      };

      const previouslyWet = cached?.data.isWet;
      weatherCache.set(gridKey, { data: parsedData, timestamp: now });

      // If condition changes, emit real-time push to clients in this area
      if (io && cached && previouslyWet !== isWet) {
        // geoRoom is based on Math.floor(lat*10), which roughly matches our Math.round grid
        io.to(getGeoRoom(lat, lng)).emit('traffic:update', { 
          type: 'weather', 
          data: parsedData 
        });
      }

      return parsedData;
    }
  } catch (e) {
    console.error('[Traffic] Weather fetch failed:', e);
  }

  return cached?.data || { temperature: 0, humidity: 0, precipitation: 0, isWet: false, summary: "Weather data unavailable." };
}

function classifyCongestion(avgSpeed: number, freeFlow: number) {
  const ratio = avgSpeed / freeFlow;
  if (ratio >= 0.75) return 'Low';
  if (ratio >= 0.4) return 'Moderate';
  return 'High';
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchOverpassIncidents(lat: number, lng: number, radiusM: number) {
  const query = `[out:json][timeout:15];(
    node["highway"="speed_camera"](around:${radiusM},${lat},${lng});
    node["hazard"](around:${radiusM},${lat},${lng});
    node["amenity"="police"](around:${radiusM},${lat},${lng});
    node["traffic_calming"](around:${radiusM},${lat},${lng});
    way["highway"="construction"](around:${radiusM},${lat},${lng});
    node["barrier"="toll_booth"](around:${radiusM},${lat},${lng});
    node["flood_prone"="yes"](around:${radiusM},${lat},${lng});
    way["surface"="unpaved"](around:${radiusM},${lat},${lng});
  );out center;`;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return (data.elements || []).map((el: any) => {
      const t = el.tags || {};
      let label = 'Unknown Hazard';
      let type = 'info';
      if (t.highway === 'speed_camera') { label = '📷 Speed Camera'; type = 'warning'; }
      else if (t.amenity === 'police') { label = '👮 Police Post'; type = 'warning'; }
      else if (t.hazard) { label = `⚠️ Hazard: ${t.hazard}`; type = 'danger'; }
      else if (t.highway === 'construction') { label = '🚧 Road Work'; type = 'warning'; }
      else if (t.barrier === 'toll_booth') { label = '💳 Toll Booth'; type = 'info'; }
      else if (t.flood_prone === 'yes') { label = '🌊 Flood Prone'; type = 'danger'; }
      else if (t.surface === 'unpaved') { label = '🪨 Unpaved Road'; type = 'info'; }
      else if (t.traffic_calming) { label = `🔴 Speed Bump (${t.traffic_calming})`; type = 'info'; }

      const elLat = el.lat || el.center?.lat;
      const elLng = el.lon || el.center?.lon;
      return {
        label, type, source: 'static' as const,
        lat: elLat || null, lng: elLng || null,
        distKm: elLat && elLng ? haversineKm(lat, lng, elLat, elLng).toFixed(1) : null,
        name: t.name || t['name:en'] || null,
      };
    });
  } catch (e) {
    console.error('[Traffic] Overpass error:', e);
    return [];
  }
}

export function createTrafficRouter({ supabase, io }: TrafficRouterDeps) {
  const router = express.Router();
  const OSRM_URL = process.env.OSRM_URL || 'http://localhost:5000';

  // Socket.IO traffic rooms
  if (io) {
    io.on('connection', (socket) => {
      socket.on('traffic:subscribe', ({ lat, lng }: { lat: number; lng: number }) => {
        socket.join(getGeoRoom(lat, lng));
      });
    });
  }

  // Background flush: aggregate -> Supabase every 30s
  setInterval(async () => {
    if (!supabase) return;
    const now = Date.now();
    const WINDOW_MS = 5 * 60 * 1000;
    const updates: any[] = [];

    for (const [wayId, agg] of segmentAggregates.entries()) {
      if (now - agg.windowStart > WINDOW_MS) { segmentAggregates.delete(wayId); continue; }
      if (agg.sampleCount === 0) continue;

      const avgSpeed = agg.sumSpeed / agg.sampleCount;
      const isLive = agg.sampleCount >= 3;
      const freeFlow = DEFAULT_FREEFLOW_SPEEDS['primary'] || 50;
      const congestion = classifyCongestion(avgSpeed, freeFlow);

      updates.push({
        way_id: wayId, avg_speed_kmh: Math.round(avgSpeed * 10) / 10,
        congestion_level: congestion, data_source: isLive ? 'live' : 'estimated',
        sample_count: agg.sampleCount, updated_at: new Date().toISOString(),
      });
      segmentAggregates.delete(wayId);
    }

    if (updates.length > 0) {
      const { error } = await supabase.from('traffic_segments').upsert(updates, { onConflict: 'way_id' });
      if (error) console.error('[Traffic] Flush error:', error);
      else if (io) io.emit('traffic:update', { type: 'segments', data: updates });
    }
  }, 30000);

  // GET /api/traffic/overview
  router.get('/overview', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const radiusKm = parseFloat(req.query.radiusKm as string) || 2.5;
      if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'Invalid lat/lng' });

      const [staticIncidents, crowdReports, segments, weatherData] = await Promise.all([
        fetchOverpassIncidents(lat, lng, radiusKm * 1000),
        supabase
          ? supabase.from('reported_incidents').select('*').gt('expires_at', new Date().toISOString()).then(r => r.data || [])
          : Promise.resolve([]),
        supabase
          ? supabase.from('traffic_segments').select('*').then(r => r.data || [])
          : Promise.resolve([]),
        getWeatherForLocation(lat, lng, io)
      ]);

      // Build routes from OSRM
      let routes: any[] = [];
      try {
        const probes = [
          { dlat: lat + 0.018, dlng: lng },
          { dlat: lat, dlng: lng + 0.022 },
          { dlat: lat - 0.018, dlng: lng },
        ];
        const routeResults = await Promise.allSettled(probes.map(async (p) => {
          const url = `${OSRM_URL}/route/v1/driving/${lng},${lat};${p.dlng},${p.dlat}?overview=false&steps=true&annotations=nodes`;
          const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
          const d = await r.json();
          const route = d.routes?.[0];
          if (!route) return null;
          const roadName = route.legs?.[0]?.steps?.[0]?.name || 'Unnamed Road';
          const distKm = (route.distance / 1000).toFixed(1);
          const durMin = Math.round(route.duration / 60);
          const speedKmh = Math.round((route.distance / 1000) / ((route.duration || 1) / 3600));
          const freeFlow = DEFAULT_FREEFLOW_SPEEDS['primary'] || 50;

          const routeNodes = route.legs?.[0]?.annotation?.nodes || [];
          const routeNodesSet = new Set(routeNodes.map((n: any) => n.toString()));

          let matchedSeg = null;
          let minGridDist = Infinity;

          for (const s of (segments as any[])) {
            if (!s.way_id || !s.avg_speed_kmh) continue;
            if (routeNodesSet.has(s.way_id)) {
              matchedSeg = s;
              break; // Found an exact node match on the route
            }
            if (s.way_id.startsWith('grid:')) {
              const parts = s.way_id.split(':');
              const cellLat = parseFloat(parts[1]);
              const cellLng = parseFloat(parts[2]);
              const dist = haversineKm(lat, lng, cellLat, cellLng);
              if (dist < minGridDist && dist < 1.0) { // Within 1km of route start
                minGridDist = dist;
                matchedSeg = s;
              }
            }
          }

          const effectiveSpeed = matchedSeg ? matchedSeg.avg_speed_kmh : speedKmh;
          const congestion = classifyCongestion(effectiveSpeed, freeFlow);
          const dataSource = matchedSeg && matchedSeg.sample_count >= 3 ? 'live' : 'estimated';
          return { name: roadName, distKm, durMin, speedKmh: effectiveSpeed, congestion, dataSource };
        }));
        routes = routeResults
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
          .map(r => r.value);
      } catch (e) {
        console.warn('[Traffic] OSRM route error:', e);
      }

      // If OSRM routes are unavailable, use active grid cells as virtual routes
      if (routes.length === 0) {
        (segments as any[]).forEach((s) => {
          if (s.way_id && s.way_id.startsWith('grid:')) {
            const parts = s.way_id.split(':');
            const cellLat = parseFloat(parts[1]);
            const cellLng = parseFloat(parts[2]);
            const dist = haversineKm(lat, lng, cellLat, cellLng);
            
            if (dist <= radiusKm) {
              const speed = s.avg_speed_kmh;
              routes.push({
                name: 'Local Area (Live Data)',
                distKm: dist.toFixed(1),
                durMin: Math.round(((dist || 0.1) / (speed || 1)) * 60),
                speedKmh: speed,
                congestion: classifyCongestion(speed, 40),
                dataSource: 'live'
              });
            }
          }
        });
      }

      // Format crowd reports as incidents
      const crowdIncidents = (crowdReports as any[]).map((r: any) => ({
        id: r.id,
        label: `🚨 ${r.type.charAt(0).toUpperCase() + r.type.slice(1)}`,
        type: r.type === 'accident' ? 'danger' : 'warning',
        source: 'crowd' as const,
        lat: r.lat, lng: r.lng,
        distKm: haversineKm(lat, lng, r.lat, r.lng).toFixed(1),
        name: null, confirmCount: r.confirm_count,
      }));

      const allIncidents = [...staticIncidents, ...crowdIncidents]
        .sort((a, b) => parseFloat(a.distKm || '99') - parseFloat(b.distKm || '99'));

      if (weatherData && weatherData.isWet) {
        allIncidents.unshift({
          id: 'weather_wet',
          label: `🌧️ Wet Road Advisory`,
          type: 'warning',
          source: 'weather',
          lat, lng,
          distKm: '0.0',
          name: 'Local Area',
          confirmCount: 0
        });
      }

      const highRoutes = routes.filter(r => r.congestion === 'High').length;
      const modRoutes = routes.filter(r => r.congestion === 'Moderate').length;
      let congestionLevel: 'Low' | 'Moderate' | 'High' = 'Low';
      if (highRoutes >= 2 || allIncidents.filter(i => i.source === 'crowd').length >= 4) congestionLevel = 'High';
      else if (modRoutes >= 1 || allIncidents.length >= 2) congestionLevel = 'Moderate';

      res.json({
        congestionLevel,
        trafficPresent: congestionLevel !== 'Low' || allIncidents.length > 0,
        incidents: allIncidents,
        routes,
        radius: `${radiusKm} km`,
        fetchedAt: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      console.error('[Traffic] Overview error:', err);
      res.status(500).json({ error: 'Traffic overview failed' });
    }
  });

  // POST /api/traffic/probe
  router.post('/probe', async (req, res) => {
    try {
      const probe = ProbeSchema.parse(req.body);
      if (probe.speedKmh < 0 || probe.speedKmh > 200) return res.json({ status: 'ignored' });

      // Map-match via OSRM
      let wayId = 'unknown';
      try {
        const ts = Math.floor(probe.timestamp / 1000);
        const matchRes = await fetch(
          `${OSRM_URL}/match/v1/driving/${probe.lng},${probe.lat}?timestamps=${ts}&radiuses=25`,
          { signal: AbortSignal.timeout(3000) }
        );
        const matchData = await matchRes.json();
        if (matchData.matchings?.[0]?.legs?.[0]?.annotation?.nodes?.[0]) {
          wayId = matchData.matchings[0].legs[0].annotation.nodes[0].toString();
        }
      } catch { /* OSRM unavailable — skip */ }

      if (wayId === 'unknown') {
        // Fallback to spatial grid if OSRM is down (~110m cells)
        wayId = `grid:${probe.lat.toFixed(3)}:${probe.lng.toFixed(3)}`;
      }

      const now = Date.now();
      let agg = segmentAggregates.get(wayId);
      if (!agg) {
        agg = { wayId, sumSpeed: 0, sampleCount: 0, windowStart: now, speeds: [] };
        segmentAggregates.set(wayId, agg);
      }

      // Z-score outlier filter
      if (agg.sampleCount > 2) {
        const mean = agg.sumSpeed / agg.sampleCount;
        const variance = agg.speeds.reduce((s, v) => s + (v - mean) ** 2, 0) / agg.sampleCount;
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0 && Math.abs(probe.speedKmh - mean) > 3 * stdDev) {
          return res.json({ status: 'outlier' });
        }
      }

      agg.sumSpeed += probe.speedKmh;
      agg.sampleCount++;
      agg.speeds.push(probe.speedKmh);
      if (agg.speeds.length > 50) agg.speeds.shift();

      res.json({ status: 'ok' });
    } catch { res.status(400).json({ error: 'Invalid probe' }); }
  });

  // POST /api/traffic/report
  router.post('/report', async (req, res) => {
    try {
      const report = ReportSchema.parse(req.body);
      if (!supabase) return res.status(503).json({ error: 'DB unavailable' });

      const { data, error } = await supabase.from('reported_incidents').insert({
        type: xss(report.type), lat: report.lat, lng: report.lng,
        reported_by: hashSession(report.sessionId),
        expires_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      }).select().single();

      if (error) throw error;
      if (io) io.to(getGeoRoom(report.lat, report.lng)).emit('traffic:update', { type: 'new_report', data });
      res.status(201).json(data);
    } catch { res.status(400).json({ error: 'Invalid report' }); }
  });

  // POST /api/traffic/report/:id/confirm
  router.post('/report/:id/confirm', async (req, res) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'DB unavailable' });

      const { data: inc } = await supabase.from('reported_incidents')
        .select('*').eq('id', req.params.id).single();
      if (!inc) return res.status(404).json({ error: 'Not found' });

      const maxExpiry = new Date(inc.created_at).getTime() + 4 * 60 * 60 * 1000;
      const newExpiry = Math.min(new Date(inc.expires_at).getTime() + 30 * 60 * 1000, maxExpiry);

      const { data: updated, error } = await supabase.from('reported_incidents')
        .update({ confirm_count: inc.confirm_count + 1, expires_at: new Date(newExpiry).toISOString() })
        .eq('id', req.params.id).select().single();

      if (error) throw error;
      if (io) io.to(getGeoRoom(inc.lat, inc.lng)).emit('traffic:update', { type: 'confirmed', data: updated });
      res.json(updated);
    } catch { res.status(500).json({ error: 'Confirm failed' }); }
  });

  return router;
}
