const fs = require('fs');

let content = fs.readFileSync('src/components/ChatbotModal.tsx', 'utf8');

// 1. Add INDIA_CONGESTION and period stuff
const congestionCode = `
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
    .replace(/^(go to|route to|navigate to|directions to|take me to|to|at|near)\\s+/i, '')
    .trim();
  const searchQuery = userCity && !cleaned.toLowerCase().includes(userCity.toLowerCase())
    ? \`\${cleaned} \${userCity} India\`
    : \`\${cleaned} India\`;

  let lat: number | null = null, lng: number | null = null, displayName: string | null = null, state: string | null = null;
  try {
    const url = \`https://nominatim.openstreetmap.org/search?q=\${encodeURIComponent(searchQuery)}&format=json&limit=3&addressdetails=1&accept-language=en&countrycodes=in\`;
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
      const url = \`https://geocoding-api.open-meteo.com/v1/search?name=\${encodeURIComponent(cleaned)}&count=3&language=en&format=json\`;
      const data = await fetch(url).then(r => r.json());
      if (data.results?.length) {
        const india = data.results.find((r: any) => r.country_code === 'IN') || data.results[0];
        lat         = india.latitude;
        lng         = india.longitude;
        state       = india.admin1 || '';
        displayName = india.admin1 ? \`\${india.name}, \${india.admin1}\` : india.name;
      }
    } catch(e: any) {
      console.warn('[Geocode] Open-Meteo failed:', e.message);
    }
  }

  if (!lat || !lng) return null;

  let confirmedAddress = displayName;
  try {
    const revUrl = \`https://nominatim.openstreetmap.org/reverse?lat=\${lat}&lon=\${lng}&format=json&zoom=17&addressdetails=1\`;
    const rev  = await fetch(revUrl, { headers: { 'Accept-Language': 'en' } }).then(r => r.json());
    const a = rev.address || {};
    const streetAddr = [
      a.house_number ? \`\${a.house_number} \${a.road || ''}\`.trim() : (a.road || null),
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
  const coords = \`\${oLng},\${oLat};\${dLng},\${dLat}\`;
  const params = 'steps=true&alternatives=true&overview=simplified&geometries=geojson&annotations=false';
  let osrmData: any = null;
  for (const base of OSRM_ENDPOINTS) {
    try {
      const ctrl    = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const res     = await fetch(\`\${base}/route/v1/driving/\${coords}?\${params}\`, { signal: ctrl.signal });
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
    const corrDurText = corrDurMin < 60 ? \`\${corrDurMin} min\` : \`\${Math.floor(corrDurMin/60)} hr \${corrDurMin%60} min\`;
    const distKm    = rawDistM / 1000;
    const distText  = distKm < 1 ? \`\${Math.round(rawDistM)} metres\` : (distKm < 10 ? \`\${distKm.toFixed(1)} km\` : \`\${Math.round(distKm)} km\`);

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
          distance    : dist < 1000 ? \`\${Math.round(dist)} m\` : \`\${(dist/1000).toFixed(1)} km\`,
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
  if (type === 'depart')  return \`🚦 Head out\`;
  if (type === 'arrive')  return \`📍 Arrive at destination\`;
  const icon = (modifier && TURN_ICONS[modifier]) || ICONS[type] || '⬆️';
  const dir  = modifier ? modifier.replace('slight ', 'slightly ').replace('sharp ', 'sharply ') : '';
  const action = type === 'turn' ? \`Turn \${dir}\` : type === 'roundabout' ? \`Enter roundabout, take \${dir} exit\` : type === 'rotary' ? \`Enter rotary\` : type === 'fork' ? \`Keep \${dir} at fork\` : type === 'merge' ? \`Merge \${dir}\` : type === 'on ramp' ? \`Take \${dir} ramp onto\` : type === 'off ramp' ? \`Exit \${dir} onto\` : type === 'end of road' ? \`Turn \${dir} at end of road\` : type === 'new name' ? \`Continue onto\` : \`Continue\`;
  return \`\${icon} \${action}\${road ? ' ' + road : ''}\`;
}

async function handleNavigationQueryV2(destinationText: string, userLat: number, userLng: number, userCity: string = '') {
  if (!userLat || !userLng) {
    return { error: true, voice: 'I need your location to give you directions. Enable GPS first.' };
  }
  const dest = await geocodeDestinationPrecise(destinationText, userCity);
  if (!dest) {
    return { error: true, voice: \`I couldn't find \${destinationText} on the map. Say the full name, like Malleswaram Bengaluru or Koramangala 5th Block.\` };
  }
  const confirmMsg = \`I'll take you to \${dest.fullAddress}.\`;
  let routeResult: any;
  try {
    routeResult = await fetchPrecisionRoute(userLat, userLng, dest.lat, dest.lng, dest.fullAddress || '');
  } catch(e) {
    return { error: true, voice: \`I found \${dest.fullAddress} but couldn't calculate a driving route. Please try again.\` };
  }
  const best = routeResult.routes[0];
  const mapsUrl = \`https://www.google.com/maps/dir/?api=1&origin=\${userLat},\${userLng}&destination=\${dest.lat},\${dest.lng}&travelmode=driving\`;
  (window as any)._lastRoute = {
    destination: destinationText, fullAddress: dest.fullAddress, destLat: dest.lat, destLng: dest.lng, routes: routeResult.routes, congestion: { factor: routeResult.factor, period: routeResult.period }, mapsUrl, fetchedAt: new Date().toLocaleTimeString(), userCity,
  };
  return { error: false, confirmMsg, dest, routes: routeResult.routes, best, mapsUrl, factor: routeResult.factor, period: routeResult.period };
}

`;

content = content.replace(/async function geocodeCity[\s\S]*?function buildSystemPrompt/m, congestionCode + "function buildSystemPrompt");

content = content.replace(
  /const routeSection = \(isRoute && R\) \? `[\s\S]*?` : '';/ms,
  `const routeSection = (isRoute && R) ? \`
=== PRECISE NAVIGATION DATA ===
User asked for   : "\${R.destination}"
Confirmed dest   : \${R.fullAddress}
GPS destination  : \${R.destLat?.toFixed(5)}°N, \${R.destLng?.toFixed(5)}°E

BEST ROUTE (traffic-corrected):
  Travel time     : \${R.routes[0]?.corrDurText}
                    (OSRM base: \${R.routes[0]?.rawDurMin} min, corrected
                     for Indian traffic — \${R.congestion?.factor}× multiplier
                     during \${R.congestion?.period === 'peak' ? 'peak hours' :
                     R.congestion?.period === 'night' ? 'night time' : 'normal traffic'})
  Distance        : \${R.routes[0]?.distText}
  Via roads       : \${R.routes[0]?.majorRoads.join(' → ') || 'local roads'}
  Type            : \${R.routes[0]?.label}

TURN-BY-TURN (first 5 steps):
\${R.routes[0]?.steps.slice(0, 5).map((s: any, i: number) =>
  \`  \${i+1}. \${s.instruction} — \${s.distance}\`
).join('\\n')}

ALTERNATIVES:
\${R.routes.slice(1).map((r: any) =>
  \`  • \${r.label}: \${r.corrDurText}, \${r.distText}\`
).join('\\n') || '  None'}

Maps link    : \${R.mapsUrl}
Data fetched : \${R.fetchedAt}
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
\` : '';`
);

let newIntentBlock = `
      if (!navigationDestination) {
        const msg = 'Where would you like to go? Say something like: go to Malleswaram, or take me to Koramangala.';
        setLastResponse(msg);
        speak(msg);
        return;
      }

      speak(\`Looking up \${navigationDestination}. Finding the best route.\`);
      
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
          \`https://nominatim.openstreetmap.org/reverse?lat=\${userLat}&lon=\${userLng}&format=json&zoom=10&addressdetails=1\`,
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
          \`User asked: "\${text}"\\n\`
        + \`Confirmed destination: \${result.dest?.fullAddress}\\n\`
        + \`Traffic-corrected travel time: \${result.best.corrDurText} \`
        + \`(during \${result.best.periodLabel})\\n\`
        + \`Distance: \${result.best.distText}\\n\`
        + \`Via: \${result.best.majorRoads.join(' → ') || 'local roads'}\\n\`
        + \`Congestion factor applied: \${result.factor}× (\${result.period})\\n\\n\`
        + \`Respond in 3–4 natural spoken sentences. \`
        + \`Lead with the exact confirmed address. \`
        + \`Give the corrected travel time. \`
        + \`Name the 2 main roads. \`
        + \`End with telling user you've shown directions on screen. \`
        + \`Sound exactly like Apple Siri. No lists. No markdown.\`;

      let aiReply;
      try {
          const sysP = buildSystemPrompt(true);
          aiReply = await callGemini(navPrompt, sysP);
      } catch(e) {
          aiReply = \`\${result.confirmMsg} \`
                  + \`It will take about \${result.best.corrDurText} in \${result.best.periodLabel}. \`
                  + (result.best.majorRoads.length >= 2
                     ? \`Head via \${result.best.majorRoads[0]} and continue on \${result.best.majorRoads[1]}. \`
                     : result.best.majorRoads.length === 1
                     ? \`Head via \${result.best.majorRoads[0]}. \`
                     : '')
                  + \`I've shown the full turn-by-turn directions on your screen.\`;
      }

      const conversationHistory = JSON.parse(localStorage.getItem('chatbot_context') || '[]');
      conversationHistory.push({ role: 'user', text });
      conversationHistory.push({ role: 'assistant', text: aiReply });
      localStorage.setItem('chatbot_context', JSON.stringify(conversationHistory.slice(-10)));

      setLastResponse(aiReply);
      speak(aiReply);
      setTimeout(() => renderRouteCard(result), 100);
      return;
`;

content = content.replace(/if \(\!navigationDestination\) \{[\s\S]*?\/\/ --- End Navigation Intent Detector ---/m, newIntentBlock + '\n     // --- End Navigation Intent Detector ---');

// Need to update renderRouteCard to map correctly to the new corrDurText etc.
content = content.replace(/best\.totalDur/g, 'best.corrDurText');
content = content.replace(/best\.totalDist/g, 'best.distText');
content = content.replace(/r\.totalDur/g, 'r.corrDurText');
content = content.replace(/r\.totalDist/g, 'r.distText');

fs.writeFileSync('src/components/ChatbotModal.tsx', content);

