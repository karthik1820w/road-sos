import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Bot, Mic, ArrowLeft, Loader2, Volume2 } from 'lucide-react';

import { TrafficUpdate } from '../services/trafficService';

class GeminiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));


// Congestion profiles — derived from TomTom Traffic Index 2025
const INDIA_CONGESTION: Record<string, Record<string, number>> = {
  bengaluru  : { peak: 2.5, offPeak: 1.6, night: 1.1 },
  bangalore  : { peak: 2.5, offPeak: 1.6, night: 1.1 },
  pune       : { peak: 2.0, offPeak: 1.5, night: 1.1 },
  mumbai     : { peak: 1.8, offPeak: 1.4, night: 1.1 },
  delhi      : { peak: 1.7, offPeak: 1.4, night: 1.1 },
  'new delhi': { peak: 1.7, offPeak: 1.4, night: 1.1 },
  kolkata    : { peak: 1.7, offPeak: 1.4, night: 1.1 },
  chennai    : { peak: 1.5, offPeak: 1.3, night: 1.1 },
  hyderabad  : { peak: 1.6, offPeak: 1.3, night: 1.1 },
  ahmedabad  : { peak: 1.4, offPeak: 1.2, night: 1.0 },
  surat      : { peak: 1.3, offPeak: 1.2, night: 1.0 },
  jaipur     : { peak: 1.3, offPeak: 1.2, night: 1.0 },
  lucknow    : { peak: 1.3, offPeak: 1.2, night: 1.0 },
  kochi      : { peak: 1.4, offPeak: 1.2, night: 1.0 },
  coimbatore : { peak: 1.3, offPeak: 1.2, night: 1.0 },
  nagpur     : { peak: 1.2, offPeak: 1.1, night: 1.0 },
  indore     : { peak: 1.2, offPeak: 1.1, night: 1.0 },
  udupi      : { peak: 1.2, offPeak: 1.1, night: 1.0 },
  mangalore  : { peak: 1.2, offPeak: 1.1, night: 1.0 },
  mysore     : { peak: 1.3, offPeak: 1.1, night: 1.0 },
  mysuru     : { peak: 1.3, offPeak: 1.1, night: 1.0 },
  default    : { peak: 1.3, offPeak: 1.2, night: 1.0 },
};

function getTrafficPeriod() {
  const now   = new Date();
  const istMs = now.getTime() + (5.5 * 60 * 60 * 1000);
  const ist   = new Date(istMs);
  const h     = ist.getUTCHours();
  if ((h >= 7 && h < 10) || (h >= 16 && h < 20)) return 'peak';
  if (h >= 22 || h < 6) return 'night';
  return 'offPeak';
}

function getCongestionMultiplier(cityName: string) {
  const key    = (cityName || '').toLowerCase().trim();
  const period = getTrafficPeriod();
  for (const [city, factors] of Object.entries(INDIA_CONGESTION)) {
    if (key.includes(city)) return { factor: factors[period], period };
  }
  return {
    factor: INDIA_CONGESTION.default[period],
    period,
  };
}

const PERIOD_LABELS: Record<string, string> = {
  peak    : 'peak traffic hours',
  offPeak : 'normal traffic',
  night   : 'light night traffic',
};

async function geocodeDestinationPrecise(rawDestination: string, userCity: string = '') {
  const cleaned = rawDestination
    .replace(/^(go to|route to|navigate to|directions to|take me to|to|at|near)\s+/i, '')
    .trim();
  const searchQuery = userCity && !cleaned.toLowerCase().includes(userCity.toLowerCase())
    ? `${cleaned} ${userCity} India`
    : `${cleaned} India`;

  let lat: number | null = null, lng: number | null = null, displayName: string | null = null, state: string | null = null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=3&addressdetails=1&accept-language=en&countrycodes=in`;
    const results = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'RoadSOSApp/1.0' } }).then(r => r.json());
    if (results.length > 0) {
      const best = results[0];
      lat  = parseFloat(best.lat);
      lng  = parseFloat(best.lon);
      const addr = best.address || {};
      state = addr.state || '';
      const parts = [
        addr.road || addr.pedestrian || addr.neighbourhood || null,
        addr.suburb || addr.quarter || null,
        addr.city || addr.town || addr.village || addr.county || null,
        addr.state || null,
      ].filter(Boolean);
      displayName = parts.length >= 2
        ? parts.slice(0, 3).join(', ')
        : best.display_name?.split(',').slice(0, 3).join(',').trim();
    }
  } catch(e: any) {
    console.warn('[Geocode] Nominatim failed:', e.message);
  }

  if (!lat || !lng) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleaned)}&count=3&language=en&format=json`;
      const data = await fetch(url).then(r => r.json());
      if (data.results?.length) {
        const india = data.results.find((r: any) => r.country_code === 'IN') || data.results[0];
        lat         = india.latitude;
        lng         = india.longitude;
        state       = india.admin1 || '';
        displayName = india.admin1 ? `${india.name}, ${india.admin1}` : india.name;
      }
    } catch(e: any) {
      console.warn('[Geocode] Open-Meteo failed:', e.message);
    }
  }

  if (!lat || !lng) return null;

  let confirmedAddress = displayName;
  try {
    const revUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=17&addressdetails=1`;
    const rev  = await fetch(revUrl, { headers: { 'Accept-Language': 'en' } }).then(r => r.json());
    const a = rev.address || {};
    const streetAddr = [
      a.house_number ? `${a.house_number} ${a.road || ''}`.trim() : (a.road || null),
      a.suburb || a.neighbourhood || a.quarter || null,
      a.city || a.town || a.village || null,
    ].filter(Boolean).join(', ');

    if (streetAddr.length > 5) {
      confirmedAddress = streetAddr;
      state = a.state || state;
    }
  } catch(e) {}

  return {
    lat, lng, displayName: cleaned, fullAddress: confirmedAddress, state, searchQuery,
  };
}

async function fetchPrecisionRoute(oLat: number, oLng: number, dLat: number, dLng: number, destCity: string = '') {
  const coords = `${oLng},${oLat};${dLng},${dLat}`;
  const params = 'steps=true&alternatives=true&overview=simplified&geometries=geojson&annotations=false';
  let osrmData: any = null;
  for (const base of OSRM_ENDPOINTS) {
    try {
      const ctrl    = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const res     = await fetch(`${base}/route/v1/driving/${coords}?${params}`, { signal: ctrl.signal });
      clearTimeout(timeout);
      const data    = await res.json();
      if (data.code === 'Ok' && data.routes?.length) {
        osrmData = data;
        break;
      }
    } catch(e: any) {
      console.warn('[Route] Endpoint failed:', base, e.message);
    }
  }

  if (!osrmData) throw new Error('ROUTE_UNAVAILABLE');

  const { factor, period } = getCongestionMultiplier(destCity);

  const routes = (osrmData.routes || []).slice(0, 3).map((route: any, idx: number) => {
    const rawDurSec  = route.duration;
    const rawDistM   = route.distance;
    const corrDurSec = Math.round(rawDurSec * factor);
    const corrDurMin  = Math.ceil(corrDurSec / 60);
    const corrDurText = corrDurMin < 60 ? `${corrDurMin} min` : `${Math.floor(corrDurMin/60)} hr ${corrDurMin%60} min`;
    const distKm    = rawDistM / 1000;
    const distText  = distKm < 1 ? `${Math.round(rawDistM)} metres` : (distKm < 10 ? `${distKm.toFixed(1)} km` : `${Math.round(distKm)} km`);

    const steps: any[] = [];
    for (const leg of (route.legs || [])) {
      for (const step of (leg.steps || [])) {
        const m    = step.maneuver || {};
        const type = m.type     || 'notification';
        const mod  = m.modifier || '';
        const dist = step.distance || 0;
        if (dist < 30 && !['depart','arrive'].includes(type)) continue;
        steps.push({
          instruction : buildStepText(type, mod, step.name, dist),
          road        : step.name || '',
          distance    : dist < 1000 ? `${Math.round(dist)} m` : `${(dist/1000).toFixed(1)} km`,
          distM       : dist,
          type,
        });
      }
    }

    const majorRoads: string[] = [];
    const seen = new Set();
    for (const s of steps) {
      if (s.road && s.distM > 500 && !seen.has(s.road)) {
        majorRoads.push(s.road);
        seen.add(s.road);
        if (majorRoads.length >= 5) break;
      }
    }

    return {
      index        : idx,
      label        : ['Fastest Route','Alternate Route','Third Option'][idx] || 'Route',
      rawDurSec,
      rawDurMin    : Math.ceil(rawDurSec / 60),
      corrDurSec,
      corrDurMin,
      corrDurText,
      distText,
      distKm       : distKm.toFixed(1),
      factor,
      period,
      periodLabel  : PERIOD_LABELS[period],
      steps        : steps.slice(0, 15),
      majorRoads,
      geometry     : route.geometry,
    };
  });
  routes.sort((a: any, b: any) => a.corrDurSec - b.corrDurSec);
  return { routes, factor, period };
}

function buildStepText(type: string, modifier: string, road: string, distM: number) {
  const ICONS: any = { depart: '🚦', arrive: '📍', turn: '↩️', merge: '🔀', 'on ramp': '🛣️', 'off ramp': '🛣️', fork: '⑂', roundabout: '🔵', rotary: '🔵', 'new name': '⬆️', notification: '⬆️', 'end of road': '↩️' };
  const TURN_ICONS: any = { left: '⬅️', right: '➡️', 'slight left': '↖️', 'slight right': '↗️', 'sharp left': '↰', 'sharp right': '↱', straight: '⬆️', uturn: '🔄' };
  if (type === 'depart')  return `🚦 Head out`;
  if (type === 'arrive')  return `📍 Arrive at destination`;
  const icon = (modifier && TURN_ICONS[modifier]) || ICONS[type] || '⬆️';
  const dir  = modifier ? modifier.replace('slight ', 'slightly ').replace('sharp ', 'sharply ') : '';
  const action = type === 'turn' ? `Turn ${dir}` : type === 'roundabout' ? `Enter roundabout, take ${dir} exit` : type === 'rotary' ? `Enter rotary` : type === 'fork' ? `Keep ${dir} at fork` : type === 'merge' ? `Merge ${dir}` : type === 'on ramp' ? `Take ${dir} ramp onto` : type === 'off ramp' ? `Exit ${dir} onto` : type === 'end of road' ? `Turn ${dir} at end of road` : type === 'new name' ? `Continue onto` : `Continue`;
  return `${icon} ${action}${road ? ' ' + road : ''}`;
}

async function handleNavigationQueryV2(destinationText: string, userLat: number, userLng: number, userCity: string = '') {
  if (!userLat || !userLng) {
    return { error: true, voice: 'I need your location to give you directions. Enable GPS first.' };
  }
  const dest = await geocodeDestinationPrecise(destinationText, userCity);
  if (!dest) {
    return { error: true, voice: `I couldn't find ${destinationText} on the map. Say the full name, like Malleswaram Bengaluru or Koramangala 5th Block.` };
  }
  const confirmMsg = `I'll take you to ${dest.fullAddress}.`;
  let routeResult: any;
  try {
    routeResult = await fetchPrecisionRoute(userLat, userLng, dest.lat, dest.lng, dest.fullAddress || '');
  } catch(e) {
    return { error: true, voice: `I found ${dest.fullAddress} but couldn't calculate a driving route. Please try again.` };
  }
  const best = routeResult.routes[0];
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${dest.lat},${dest.lng}&travelmode=driving`;
  (window as any)._lastRoute = {
    destination: destinationText, fullAddress: dest.fullAddress, destLat: dest.lat, destLng: dest.lng, routes: routeResult.routes, congestion: { factor: routeResult.factor, period: routeResult.period }, mapsUrl, fetchedAt: new Date().toLocaleTimeString(), userCity,
  };
  return { error: false, confirmMsg, dest, routes: routeResult.routes, best, mapsUrl, factor: routeResult.factor, period: routeResult.period };
}

const OSRM_ENDPOINTS = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
];

function renderRouteCard(routeResult: any) {
  const el = document.getElementById('route-result');
  if (!el) return;
  const best = routeResult.best;
  const tabsHtml = routeResult.routes.map((r: any, i: number) => `
    <button onclick="window._showRouteTab(${i})"
            id="rtab-${i}"
            style="background:${i === 0 ? 'rgba(59,130,246,0.15)' : 'transparent'};
                   border:1px solid ${i === 0 ? 'rgba(59,130,246,0.4)' : 'var(--border,rgba(255,255,255,0.08))'};
                   color:${i === 0 ? '#93C5FD' : 'var(--muted,#888)'};
                   padding:5px 12px;border-radius:8px;font-size:11px;
                   cursor:pointer;font-family:inherit;font-weight:500">
      ${r.label}<br>
      <span style="font-size:10px">${r.corrDurText} · ${r.distText}</span>
    </button>`
  ).join('');

  const stepsHtml = best.steps.map((s: any) => `
    <div style="display:flex;gap:10px;align-items:flex-start;
                padding:7px 0;border-bottom:1px solid var(--border,rgba(255,255,255,0.06))">
      <div style="font-size:16px;flex-shrink:0;width:24px;text-align:center">
        ${s.instruction.split(' ')[0]}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500">
          ${s.instruction.replace(/^[^\s]+\s/, '')}
          ${s.road ? `<span style="color:var(--muted,#888)"> onto ${s.road}</span>` : ''}
        </div>
        <div style="font-size:10px;color:var(--muted,#888)">${s.distText}</div>
      </div>
    </div>`
  ).join('');

  el.innerHTML = `
    <div style="background:#161616;border:1px solid rgba(255,255,255,0.08);
                border-radius:14px;overflow:hidden;margin:8px 0; max-height: 400px; display: flex; flex-direction: column;">
      <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08);
                  display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-size:13px;font-weight:600;color:white">
            📍 Route to ${routeResult.dest?.fullAddress || routeResult.dest?.displayName}
          </div>
          <div style="font-size:11px;color:#888;margin-top:2px">
            ${best.corrDurText} · ${best.distText} · ${best.label}
          </div>
        </div>
        <a href="${routeResult.mapsUrl}" target="_blank" rel="noopener"
           style="background:rgba(59,130,246,0.15);color:#93C5FD;
                  border:1px solid rgba(59,130,246,0.3);border-radius:9px;
                  padding:7px 12px;font-size:12px;text-decoration:none;
                  font-weight:500;white-space:nowrap;display:flex;
                  align-items:center;gap:5px">
          🗺️ Open Maps
        </a>
      </div>
      ${routeResult.routes.length > 1 ? `
        <div style="padding:10px 16px;display:flex;gap:6px;flex-wrap:wrap;
                    border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0">
          ${tabsHtml}
        </div>` : ''}
      ${best.majorRoads.length ? `
        <div style="padding:8px 16px;background:rgba(59,130,246,0.05);
                    border-bottom:1px solid rgba(255,255,255,0.06);
                    font-size:11px;color:#93C5FD;flex-shrink:0">
          🛣️ Via: ${best.majorRoads.join(' → ')}
        </div>` : ''}
      <div style="padding:4px 16px 12px;overflow-y:auto;flex:1" id="route-steps-container">
        <div style="font-size:10px;color:#888;
                    text-transform:uppercase;letter-spacing:1px;
                    padding:8px 0 4px">
          Turn-by-turn directions
        </div>
        ${stepsHtml}
      </div>
    </div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

(window as any)._showRouteTab = function showRouteTab(idx: number) {
  const routes = (window as any)._lastRoute?.routes;
  if (!routes || !routes[idx]) return;
  routes.forEach((_: any, i: number) => {
    const tab = document.getElementById(`rtab-${i}`);
    if (!tab) return;
    tab.style.background   = i === idx ? 'rgba(59,130,246,0.15)' : 'transparent';
    tab.style.borderColor  = i === idx ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)';
    tab.style.color        = i === idx ? '#93C5FD' : '#888';
  });
  const stepsDiv = document.getElementById('route-steps-container');
  if (!stepsDiv) return;
  const selected = routes[idx];
  stepsDiv.innerHTML = `
    <div style="font-size:10px;color:#888;
                text-transform:uppercase;letter-spacing:1px;padding:8px 0 4px">
      Turn-by-turn directions
    </div>
    ${selected.steps.map((s: any) => `
      <div style="display:flex;gap:10px;align-items:flex-start;
                  padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div style="font-size:16px;flex-shrink:0;width:24px;text-align:center">
          ${s.instruction.split(' ')[0]}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500;color:white">
            ${s.instruction.replace(/^[^\s]+\s/, '')}
            ${s.road ? `<span style="color:#888"> onto ${s.road}</span>` : ''}
          </div>
          <div style="font-size:10px;color:#888">${s.distText}</div>
        </div>
      </div>`
    ).join('')}`;
};

function buildSystemPrompt(isRoute: boolean = false) {
  const R = (window as any)._lastRoute;
  const routeSection = (isRoute && R) ? `
=== PRECISE NAVIGATION DATA ===
User asked for   : "${R.destination}"
Confirmed dest   : ${R.fullAddress}
GPS destination  : ${R.destLat?.toFixed(5)}°N, ${R.destLng?.toFixed(5)}°E

BEST ROUTE (traffic-corrected):
  Travel time     : ${R.routes[0]?.corrDurText}
                    (OSRM base: ${R.routes[0]?.rawDurMin} min, corrected
                     for Indian traffic — ${R.congestion?.factor}× multiplier
                     during ${R.congestion?.period === 'peak' ? 'peak hours' :
                     R.congestion?.period === 'night' ? 'night time' : 'normal traffic'})
  Distance        : ${R.routes[0]?.distText}
  Via roads       : ${R.routes[0]?.majorRoads.join(' → ') || 'local roads'}
  Type            : ${R.routes[0]?.label}

TURN-BY-TURN (first 5 steps):
${R.routes[0]?.steps.slice(0, 5).map((s: any, i: number) =>
  `  ${i+1}. ${s.instruction} — ${s.distance}`
).join('\n')}

ALTERNATIVES:
${R.routes.slice(1).map((r: any) =>
  `  • ${r.label}: ${r.corrDurText}, ${r.distText}`
).join('\n') || '  None'}

Maps link    : ${R.mapsUrl}
Data fetched : ${R.fetchedAt}
=================================

CRITICAL INSTRUCTIONS FOR YOUR RESPONSE:
1. Lead with the CONFIRMED full address:
   "I'm routing you to [fullAddress]."
2. Give CORRECTED travel time (not raw OSRM):
   "It will take about [corrDurText] in [periodLabel]."
3. Name 2–3 major roads:
   "Take [road1], continue on [road2], then [road3]."
4. End with:
   "I've shown the full turn-by-turn directions on your screen."
5. If alternatives exist, mention the fastest:
   "There's also a [altTime] alternative if you prefer."
6. Keep it under 4 spoken sentences.
7. Sound exactly like Apple Siri — confident, specific, natural.
` : '';

  const td = (window as any)._liveTrafficData;

  const trafficSection = td ? `
=== LIVE TRAFFIC DATA (fetched ${td.fetchedAt}) ===
Location   : ${td.location}
GPS        : ${td.lat?.toFixed(4)}°N, ${td.lng?.toFixed(4)}°E
Scan radius: ${td.radius || '2.5 km'}
Congestion : ${td.congestionLevel}
Traffic present: ${td.trafficPresent ? 'YES' : 'NO — roads are clear'}
Incidents (${td.incidents?.length || 0} found):
${td.incidents?.length
  ? td.incidents.map((i: any) =>
      `  • ${i.label}${i.distKm ? ' — ' + i.distKm + ' km away' : ''}`
    ).join('\n')
  : '  None detected within scan radius'
}
Road speeds:
${td.routes?.length
  ? td.routes.map((r: any) =>
      `  • ${r.name}: ${r.speedKmh} km/h avg (${r.congestion})`
    ).join('\n')
  : '  No route data available'
}
=================================================
When asked about traffic, roads, or conditions near the user,
answer using the ABOVE REAL DATA ONLY. Do not guess or make up
traffic conditions. If data is older than 10 minutes, say so.
` : `
=== TRAFFIC DATA ===
Not yet available. The user has not fetched traffic data yet
or location permission has not been granted.
If asked about current traffic, say:
"Tap 'Get Updates' to load real-time traffic near your location,
then ask me again — I'll give you accurate local conditions."
===================
`;

  return `You are Road SOS Assistant, an intelligent road safety, traffic, and personal travel assistant for Bob.
When Bob replies to your initial greeting (like "I am good"), you should casually ask him: "Where do you want to go today?" or "What's your plan for today?" to start helping him travel.

YOU CAN ANSWER:
- General knowledge questions on any topic
- Road safety advice and driving tips
- Real-time traffic conditions (using data below)
- Emergency road guidance
- Weather impact on road conditions
- Navigation and route advice in India
- Accident prevention and first aid basics

VOICE RESPONSE RULES:
- Keep answers to 1–2 short conversational sentences MAX.
- No bullet points, no markdown, no asterisks — plain spoken English
- Never say you are an AI, a language model, or that you have a brain
- Use a friendly, natural tone. Address the user as Bob casually if appropriate.
- If you truly cannot answer, say: "I'm not sure about that, but I can
  help with road safety and traffic questions."

${routeSection}
${trafficSection}`;
}

async function callGemini(userText: string, systemPrompt: string, history?: any[]) {
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userText, systemPrompt, history }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new GeminiError(res.status.toString(), data.error || 'Server error');
    }

    if (!data.text) {
      throw new GeminiError('EMPTY', 'No response generated.');
    }

    return data.text.trim();
  } catch (e: any) {
    if (e instanceof GeminiError) throw e;
    throw new GeminiError('UNKNOWN', e.message);
  }
}

const TRAFFIC_KEYWORDS = [
  'traffic', 'road', 'jam', 'congestion', 'accident', 'block',
  'hazard', 'construction', 'police', 'speed', 'route', 'drive',
  'travel', 'highway', 'near me', 'nearby', 'around here', 'flood'
];

function isTrafficQuestion(text: string) {
  const lower = text.toLowerCase();
  return TRAFFIC_KEYWORDS.some(kw => lower.includes(kw));
}

interface ChatbotModalProps {
  onClose: () => void;
  userLocation?: { lat: number; lng: number };
  trafficData?: TrafficUpdate | null;
  onTriggerDispatch?: (type: string) => void;
  onMapNearestHospital?: () => void;
  onToggleTraffic?: (state: boolean) => void;
  onFetchTrafficUpdates?: (locationName?: string) => void;
  initialGreeting?: string;
}

export const ChatbotModal: React.FC<ChatbotModalProps> = ({ 
  onClose, 
  userLocation,
  trafficData,
  onTriggerDispatch,
  onMapNearestHospital,
  onToggleTraffic,
  onFetchTrafficUpdates,
  initialGreeting = "How can I help?"
}) => {
  const stateRef = useRef<'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR'>('IDLE');
  const [state, _setState] = useState<'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR'>('IDLE');
  
  const setState = (newState: 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR') => {
    stateRef.current = newState;
    _setState(newState);
  };

  const [transcript, setTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState<string>('');
  
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef<string>('');

  const cleanUpAudio = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try { recognitionRef.current.abort(); } catch(e) {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        setState('LISTENING');
        transcriptBufferRef.current = '';
        setTranscript('');
      };

      recognitionRef.current.onresult = (event: any) => {
        let chunkFinal = '';
        let chunkInterim = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
           if (event.results[i].isFinal) {
             chunkFinal += event.results[i][0].transcript;
           } else {
             chunkInterim += event.results[i][0].transcript;
           }
        }
        
        const currentFullText = transcriptBufferRef.current + chunkFinal + chunkInterim;
        
        // --- BARGE-IN SUPPORT ---
        if (stateRef.current === 'SPEAKING' && chunkInterim.trim().length > 3) {
           console.log("Barge-in detected - cancelling speech.");
           window.speechSynthesis.cancel();
           setState('LISTENING');
        }

        setTranscript(currentFullText);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        
        if (currentFullText.trim().length > 0) {
          const lowerText = currentFullText.toLowerCase();
          if (lowerText.includes('close chatbot') || lowerText.includes('exit chatbot') || lowerText.includes('close assistant') || lowerText.includes('exit assistant') || lowerText.includes('stop chatbot') || lowerText.includes('stop assistant') || lowerText.includes('close voice assistant') || lowerText.includes('cancel')) {
              cleanUpAudio();
              onClose();
              return;
          }
          
          silenceTimerRef.current = setTimeout(() => {
            const textToSend = currentFullText.trim();
            if (recognitionRef.current) {
              try { recognitionRef.current.stop(); } catch(e){}
            }
            if (textToSend) {
               handleQuery(textToSend);
            }
          }, 1500); // 1.5 second silence means user stopped talking (faster perceived latency)
        }

        if (chunkFinal) {
          transcriptBufferRef.current += chunkFinal + ' ';
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech' && event.error !== 'network') {
          console.error("Chatbot Voice Error:", event.error);
          setState('ERROR');
          if (event.error === 'not-allowed') {
            setVoiceError("Microphone permission was denied. Please allow microphone access in your browser or type with the keyboard instead.");
          } else {
            setVoiceError(`Voice Error: ${event.error}`);
          }
        } else if (event.error === 'network') {
          console.warn("Chatbot Voice Network Error - retrying automatically.");
        }
      };

      recognitionRef.current.onend = () => {
        // If we drop out of listening and we're not processing or speaking, restart listening
        if (stateRef.current === 'LISTENING' || stateRef.current === 'IDLE') {
           setTimeout(() => {
             if (recognitionRef.current) {
               try { recognitionRef.current.start(); } catch(e) {}
             }
           }, 300);
        }
      };
    }

    // Auto-start speaking on mount, which will trigger listening on end
    const timer = setTimeout(() => {
      speak(initialGreeting);
    }, 500);

    // prevent memory overflow by periodically restarting
    const memoryLeakInterval = setInterval(() => {
        if (stateRef.current === 'LISTENING' && recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch(e) {}
        }
    }, 45000);

    const watchdogInterval = setInterval(() => {
        if ((stateRef.current === 'LISTENING' || stateRef.current === 'IDLE') && recognitionRef.current) {
            try {
                recognitionRef.current.start();
            } catch (err: any) {
                // Ignore InvalidStateError, throw others to console
                if (err.name !== 'InvalidStateError') console.error(err);
            }
        }
    }, 2000);

    const handleChatbotQueryEvent = (e: any) => {
        const queryText = e.detail;
        if (queryText) {
            handleQuery(queryText);
        }
    };
    window.addEventListener('chatbot-query', handleChatbotQueryEvent);

    return () => {
      window.removeEventListener('chatbot-query', handleChatbotQueryEvent);
      clearTimeout(timer);
      clearInterval(memoryLeakInterval);
      clearInterval(watchdogInterval);
      cleanUpAudio();
    };
  }, []);

  const startListening = () => {
    if (voiceError) return;
    if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch(e) {}
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || state === 'PROCESSING') return;
    
    // Stop recognition if active
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(err){}
    }
    
    const query = textInput.trim();
    setTextInput('');
    setTranscript(query); // show typed message
    handleQuery(query);
  };

  const handleQuery = async (text: string) => {
    setState('PROCESSING');

    // --- Navigation Intent Detector ---
    const tLower = text.toLowerCase();
    const NAV_TRIGGERS = [
      'go to', 'how to go', 'how do i go', 'how to reach', 'how to get to',
      'route to', 'route for', 'directions to', 'navigate to',
      'way to', 'path to', 'road to',
      'i want to go', 'i need to go', 'i am going to', 'take me to',
      'drive to', 'best route', 'best way', 'shortest way',
      'how to come to', 'which road', 'which route',
      'tell me the way', 'show route', 'show way',
    ];
    const isNavigation = NAV_TRIGGERS.some(k => tLower.includes(k));
    
    let navigationDestination = null;
    if (isNavigation) {
      const NAV_DEST_PATTERNS = [
        /(?:go to|route to|navigate to|directions to|drive to|take me to|way to|path to|get to|reach|come to|going to)\s+([a-zA-Z][a-zA-Z\s,\.]{1,40}?)(?:\?|$|\.|\s+from|\s+via)/i,
        /(?:how to|best|shortest)\s+(?:go|route|way|reach|get)\s+(?:to\s+)?([a-zA-Z][a-zA-Z\s,\.]{1,40}?)(?:\?|$|\.)/i,
        /(?:to|towards)\s+([a-zA-Z][a-zA-Z\s]{1,30}?)(?:\?|$|\s+from\s)/i,
      ];
      for (const pattern of NAV_DEST_PATTERNS) {
        const m = text.match(pattern);
        if (m && m[1]) {
          const raw = m[1].trim().replace(/\s+/g,' ');
          const STOP_WORDS = ['me','you','there','here','it','this','that','my','your','the','a','an','now','today'];
          if (!STOP_WORDS.includes(raw.toLowerCase()) && raw.length > 1) {
            navigationDestination = raw;
            break;
          }
        }
      }
    }

    if (isNavigation) {
      
      if (!navigationDestination) {
        const msg = 'Where would you like to go? Say something like: go to Malleswaram, or take me to Koramangala.';
        setLastResponse(msg);
        speak(msg);
        return;
      }

      speak(`Looking up ${navigationDestination}. Finding the best route.`);
      
      let userLat = userLocation?.lat || (window as any)._currentCoords?.lat;
      let userLng = userLocation?.lng || (window as any)._currentCoords?.lng;
      let userCity = '';
      
      if (!userLat || !userLng) {
         try {
           const navReq = await new Promise((resolve, reject) => {
               navigator.geolocation.getCurrentPosition(resolve, reject);
           });
           userLat = (navReq as any).coords.latitude;
           userLng = (navReq as any).coords.longitude;
           (window as any)._currentCoords = { lat: userLat, lng: userLng };
         } catch(e) {
           const msg = 'Please enable GPS so I can calculate your route.';
           setLastResponse(msg); speak(msg); return;
         }
      }

      try {
        const rev = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${userLat}&lon=${userLng}&format=json&zoom=10&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        ).then(r => r.json());
        userCity = rev.address?.city || rev.address?.town || rev.address?.county || '';
      } catch(e) {}

      const result = await handleNavigationQueryV2(navigationDestination, userLat, userLng, userCity);

      if (result.error) {
        setLastResponse(result.voice as string);
        speak(result.voice as string);
        return;
      }

      const navPrompt =
          `User asked: "${text}"\n`
        + `Confirmed destination: ${result.dest?.fullAddress}\n`
        + `Traffic-corrected travel time: ${result.best.corrDurText} `
        + `(during ${result.best.periodLabel})\n`
        + `Distance: ${result.best.distText}\n`
        + `Via: ${result.best.majorRoads.join(' → ') || 'local roads'}\n`
        + `Congestion factor applied: ${result.factor}× (${result.period})\n\n`
        + `Respond in 3–4 natural spoken sentences. `
        + `Lead with the exact confirmed address. `
        + `Give the corrected travel time. `
        + `Name the 2 main roads. `
        + `End with telling user you've shown directions on screen. `
        + `Sound exactly like Apple Siri. No lists. No markdown.`;

      let aiReply;
      try {
          const sysP = buildSystemPrompt(true);
          aiReply = await callGemini(navPrompt, sysP);
      } catch(e) {
          aiReply = `${result.confirmMsg} `
                  + `It will take about ${result.best.corrDurText} in ${result.best.periodLabel}. `
                  + (result.best.majorRoads.length >= 2
                     ? `Head via ${result.best.majorRoads[0]} and continue on ${result.best.majorRoads[1]}. `
                     : result.best.majorRoads.length === 1
                     ? `Head via ${result.best.majorRoads[0]}. `
                     : '')
                  + `I've shown the full turn-by-turn directions on your screen.`;
      }

      const conversationHistory = JSON.parse(localStorage.getItem('chatbot_context') || '[]');
      conversationHistory.push({ role: 'user', text });
      conversationHistory.push({ role: 'assistant', text: aiReply });
      localStorage.setItem('chatbot_context', JSON.stringify(conversationHistory.slice(-10)));

      setLastResponse(aiReply);
      speak(aiReply);
      setTimeout(() => renderRouteCard(result), 100);
      return;
    }
     // --- End Navigation Intent Detector ---

    if (isTrafficQuestion(text) && !(window as any)._liveTrafficData) {
      console.log("Chatbot: Intercepted traffic question. Fetching data implicitly.");
      onFetchTrafficUpdates?.();
      setLastResponse("Let me check the roads near you first — fetching live data...");
      // removed speak() here to avoid speaking before fetchTrafficUpdates speaks
      return; 
    }
    
    const getUpdateMatch = text.match(/(?:get updates|get updates ones|get update|traffic updates?)(?:\s+(?:about|on|in|for|at)\s+(.+))?/i);
    if (getUpdateMatch) {
       console.log("Chatbot: Get Updates intercepted");
       const locationName = getUpdateMatch[1];
       onFetchTrafficUpdates?.(locationName);
       const updateResponse = locationName ? `Getting traffic updates for ${locationName}.` : "Getting traffic updates for your current location.";
       setLastResponse(updateResponse);
       // we removed speak() here so it only speaks once via App.tsx
       return;
    }

    const conversationHistory = JSON.parse(localStorage.getItem('chatbot_context') || '[]');
    conversationHistory.push({ role: 'user', text });
    
    try {
      if (!navigator.onLine) {
        throw new Error("OFFLINE");
      }
      
      const historyContextPayload = conversationHistory.slice(-7, -1); // skip the latest user query which was just pushed

      const systemPrompt = buildSystemPrompt();
      const reply        = await callGemini(text, systemPrompt, historyContextPayload);
      
      conversationHistory.push({ role: 'assistant', text: reply });
      localStorage.setItem('chatbot_context', JSON.stringify(conversationHistory.slice(-10)));
      
      setLastResponse(reply);
      speak(reply);
      
    } catch (err: any) {
      console.error('[ChatBot Error]', err.code, err.message);
      
      let fallbackText = "Something went wrong on my end. Please try again in a few seconds.";

      if (err.message === "OFFLINE" || !navigator.onLine) {
         fallbackText = "It looks like you are offline. I am switching to basic on-device logic. I can still help you dial emergency services locally if you say help.";
         if (text.toLowerCase().includes("help") || text.toLowerCase().includes("emergency")) {
             fallbackText = "Offline mode active. Connecting you to emergency dispatch automatically.";
             onTriggerDispatch?.('offline_distress');
         }
      } else {
        const errorMessages: Record<string, string> = {
          'EXHAUSTED'  : "I'm getting a lot of questions right now. Please wait a moment and ask again.",
          'AUTH_FAILED': "My AI connection has a setup issue. Please check the API key in settings.",
          'BAD_REQUEST': "I had trouble understanding that format. Could you rephrase?",
          'SAFETY'     : "I can't answer that one, but feel free to ask anything about road safety!",
          'RECITATION' : "Let me rephrase that. Ask me again and I'll try differently.",
          'EMPTY'      : "I got a blank response. Please ask me again.",
          '429'        : "I'm getting a lot of questions right now. Please wait a moment and ask again."
        };

        if (err.message && errorMessages[err.message]) {
          fallbackText = errorMessages[err.message];
        } else if (err.code && errorMessages[err.code]) {
          fallbackText = errorMessages[err.code];
        }
      }
      
      setLastResponse(fallbackText);
      speak(fallbackText);
      
      window.dispatchEvent(new CustomEvent('chatbot-error-log', { detail: { error: err.message, query: text } }));
    }
  };

  const speak = (msg: string) => {
    if ('speechSynthesis' in window) {
      setState('SPEAKING');
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(msg);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      utterance.onend = () => {
        // Resume listening after speaking
        setTimeout(() => {
           startListening();
        }, 500);
      };
      
      utterance.onerror = () => {
        setTimeout(() => {
           startListening();
        }, 500);
      };
      
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex flex-col p-6 items-center justify-center"
    >
      <button onClick={onClose} className="absolute top-8 left-8 text-slate-500 hover:text-white transition-colors flex items-center gap-2">
        <ArrowLeft size={24} />
        <span className="font-bold uppercase tracking-widest text-xs">Back</span>
      </button>

      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-[40px] p-8 shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
        
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 border transition-all duration-700 ${state === 'LISTENING' ? 'bg-blue-500/20 border-blue-500/50 animate-pulse' : state === 'PROCESSING' ? 'bg-amber-500/20 border-amber-500/50' : state === 'SPEAKING' ? 'bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.3)]' : 'bg-slate-800 border-slate-700'}`}>
           {state === 'LISTENING' && <Mic className="text-blue-500" size={40} />}
           {state === 'PROCESSING' && <Loader2 className="text-amber-500 animate-spin" size={40} />}
           {state === 'SPEAKING' && <Volume2 className="text-emerald-500 animate-bounce" size={40} />}
           {state === 'IDLE' && <Bot className="text-slate-500" size={40} />}
           {state === 'ERROR' && <Bot className="text-red-500" size={40} />}
        </div>
        
        <h2 className="text-xl font-black mb-6 uppercase tracking-widest text-white">
            {state === 'LISTENING' ? 'Listening...' : state === 'PROCESSING' ? 'Thinking...' : state === 'SPEAKING' ? 'Speaking' : state === 'ERROR' ? 'Mic Error' : 'Chatbot Status'}
        </h2>

        {voiceError && (
          <div className="w-full bg-red-950/40 border border-red-500/20 p-4 rounded-2xl mb-4 text-center">
             <p className="text-red-400 text-xs font-semibold mb-2">{voiceError}</p>
             <button
               id="retry-voice-mic-btn"
               onClick={() => {
                 setVoiceError(null);
                 setState('IDLE');
                 if (recognitionRef.current) {
                   try { recognitionRef.current.start(); } catch(e){}
                 }
               }}
               className="px-4 py-2 bg-blue-650 hover:bg-blue-550 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all"
             >
               Retry Microphone
             </button>
          </div>
        )}

        {transcript && state === 'LISTENING' && (
            <div className="w-full bg-slate-950 border border-blue-500/20 p-5 rounded-2xl mb-4">
                <p className="text-slate-300 font-medium italic text-lg leading-relaxed">"{transcript}"</p>
            </div>
        )}

        {lastResponse && state !== 'LISTENING' && (
            <div className="w-full bg-slate-800 border border-slate-700 p-5 rounded-2xl mb-4 text-left">
                <p className="text-white font-medium text-lg leading-relaxed">{lastResponse}</p>
            </div>
        )}
        
        <div id="route-result" className="w-full text-left"></div>

        <form onSubmit={handleManualSubmit} className="w-full mt-4 flex gap-2">
          <input
            id="chatbot-text-input"
            type="text"
            placeholder="Type your question or destination..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={state === 'PROCESSING'}
            className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none text-sm transition-all"
          />
          <button
            id="send-chatbot-query-btn"
            type="submit"
            disabled={state === 'PROCESSING' || !textInput.trim()}
            className="bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:scale-100 disabled:opacity-40 transition-all text-white px-5 py-3 rounded-2xl font-bold uppercase tracking-widest text-[10px]"
          >
            Send
          </button>
        </form>
      </div>
    </motion.div>
  );
};
