export interface TrafficIncident {
  type: string;
  name: string;
  lat: number | null;
  lng: number | null;
  count?: number;
}

export interface TrafficRoute {
  name: string;
  duration: number | null;
  distance: string | null;
}

export interface TrafficUpdate {
  location: string;
  congestionLevel: 'Low' | 'Moderate' | 'High';
  incidents: TrafficIncident[];
  routes: TrafficRoute[];
  lastUpdated: Date;
}

const formatTag = (tags: any) => {
  if (tags.hazard) return 'Road Hazard: ' + tags.hazard;
  if (tags.highway === 'construction') return 'Road Under Construction';
  if (tags.amenity === 'police') return 'Police Checkpoint';
  if (tags.highway === 'speed_camera') return 'Speed Camera';
  if (tags.traffic_calming) return 'Speed Bump / Traffic Calming';
  if (tags.barrier === 'toll_booth') return 'Toll Booth';
  return 'Road Incident';
};

const parseOverpassResults = (elements: any[]): TrafficIncident[] => {
  const rawIncidents = elements
    .filter(el => el.tags)
    .map(el => ({
      type: el.tags.hazard || el.tags.highway || el.tags.amenity 
            || el.tags.traffic_calming || 'incident',
      name: el.tags.name || el.tags['name:en'] || formatTag(el.tags),
      lat: el.lat || null,
      lng: el.lon || null,
      count: 1
    }))
    .filter(el => el.name);

  // Aggregate incidents by name to avoid repetition
  const aggregatedMap = new Map<string, TrafficIncident>();
  
  for (const inc of rawIncidents) {
    if (aggregatedMap.has(inc.name)) {
      const existing = aggregatedMap.get(inc.name)!;
      existing.count = (existing.count || 1) + 1;
    } else {
      aggregatedMap.set(inc.name, inc);
    }
  }

  // Convert back to array, sort by count (descending), and limit to 10
  return Array.from(aggregatedMap.values())
    .sort((a, b) => (b.count || 1) - (a.count || 1))
    .slice(0, 10);
};

export const fetchRoadHazards = async (lat: number, lng: number): Promise<TrafficIncident[]> => {
  const radius = 5000;
  const query = `
    [out:json][timeout:25];
    (
      node["hazard"](around:${radius},${lat},${lng});
      way["highway"="construction"](around:${radius},${lat},${lng});
      node["traffic_calming"](around:${radius},${lat},${lng});
      node["amenity"="police"](around:3000,${lat},${lng});
      way["barrier"="toll_booth"](around:${radius},${lat},${lng});
      node["highway"="speed_camera"](around:${radius},${lat},${lng});
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
  if (!res.ok) throw new Error("Overpass API error");
  const data = await res.json();
  return parseOverpassResults(data.elements || []);
};

export const fetchRouteTime = async (lat: number, lng: number): Promise<TrafficRoute[]> => {
  const destinations = [
    { name: 'Route A (North)', dlat: lat + 0.05, dlng: lng + 0.02 },
    { name: 'Route B (East)', dlat: lat + 0.02, dlng: lng + 0.06 },
    { name: 'Route C (Bypass)', dlat: lat - 0.01, dlng: lng + 0.08 },
  ];

  const results = await Promise.allSettled(destinations.map(async d => {
    const url = `https://router.project-osrm.org/route/v1/driving/` +
      `${lng},${lat};${d.dlng},${d.dlat}` +
      `?overview=false&steps=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("OSRM error");
    const data = await res.json();
    const route = data.routes?.[0];
    return {
      name: d.name,
      duration: route ? Math.round(route.duration / 60) : null,
      distance: route ? (route.distance / 1000).toFixed(1) : null,
    };
  }));

  return results
    .filter((r): r is PromiseFulfilledResult<TrafficRoute> => r.status === 'fulfilled' && (r.value as any).duration !== null)
    .map(r => r.value);
};

const classifyCongestion = (incidents: any[], routes: any[]) => {
  const incidentCount = incidents.length;
  const avgDuration = routes.reduce((s, r) => s + (r.duration || 0), 0) / (routes.length || 1);

  if (incidentCount >= 5 || avgDuration > 25) return 'High';
  if (incidentCount >= 2 || avgDuration > 15) return 'Moderate';
  return 'Low';
};

export const fetchLiveTrafficData = async (lat: number, lng: number): Promise<TrafficUpdate> => {
  const [hazardsResult, routesResult, geoResult] = await Promise.allSettled([
    fetchRoadHazards(lat, lng),
    fetchRouteTime(lat, lng),
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
      .then(r => r.json())
  ]);

  const incidents = hazardsResult.status === 'fulfilled' ? hazardsResult.value : [];
  const routes    = routesResult.status === 'fulfilled'  ? routesResult.value  : [];
  const geo       = geoResult.status === 'fulfilled'     ? geoResult.value     : null;

  const area = geo?.address
    ? [geo.address.road, geo.address.suburb || geo.address.village,
       geo.address.city || geo.address.town].filter(Boolean).join(', ')
    : `${lat.toFixed(3)}, ${lng.toFixed(3)}`;

  return {
    location: area,
    congestionLevel: classifyCongestion(incidents, routes),
    incidents,
    routes,
    lastUpdated: new Date()
  };
};
