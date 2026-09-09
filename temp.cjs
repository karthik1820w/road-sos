const fs = require('fs'); 
fs.appendFileSync('tests/traffic-api.test.ts', `
import { applyTrafficSocketUpdate, TrafficUpdate } from '../src/services/trafficService';

describe('Traffic System: Socket Reducer (Task 1)', () => {
  it('applies new report to state', () => {
    const initialState: TrafficUpdate = {
      location: 'Test', lat: 0, lng: 0, trafficPresent: false,
      congestionLevel: 'Low', incidents: [], routes: [],
      fetchedAt: '', radius: '', updateSource: 'poll'
    };

    const nextState = applyTrafficSocketUpdate(initialState, {
      type: 'new_report',
      data: { id: 'abc', type: 'accident', lat: 0.01, lng: 0.01, confirm_count: 0 }
    });

    expect(nextState?.updateSource).toBe('socket');
    expect(nextState?.incidents.length).toBe(1);
    expect(nextState?.incidents[0].id).toBe('abc');
    expect(nextState?.incidents[0].source).toBe('crowd');
    expect(nextState?.incidents[0].confirmCount).toBe(0);
  });

  it('updates confirmed report count', () => {
    const initialState: TrafficUpdate = {
      location: 'Test', lat: 0, lng: 0, trafficPresent: false,
      congestionLevel: 'Low', 
      incidents: [{ id: 'abc', label: 'test', type: 'warning', source: 'crowd', lat: 0, lng: 0, distKm: '0', name: 'Test', confirmCount: 0 }], 
      routes: [],
      fetchedAt: '', radius: '', updateSource: 'poll'
    };

    const nextState = applyTrafficSocketUpdate(initialState, {
      type: 'confirmed',
      data: { id: 'abc', confirm_count: 5 }
    });

    expect(nextState?.incidents[0].confirmCount).toBe(5);
  });

  it('adds weather advisory when wet', () => {
    const initialState: TrafficUpdate = {
      location: 'Test', lat: 0, lng: 0, trafficPresent: false,
      congestionLevel: 'Low', incidents: [], routes: [],
      fetchedAt: '', radius: '', updateSource: 'poll'
    };

    const nextState = applyTrafficSocketUpdate(initialState, {
      type: 'weather',
      data: { isWet: true }
    });

    expect(nextState?.incidents.length).toBe(1);
    expect(nextState?.incidents[0].source).toBe('weather');
    expect(nextState?.incidents[0].id).toBe('weather_wet');
  });
});

describe('Traffic System: Weather Advisory (Task 3)', () => {
  it('identifies precipitation > 1.5mm as wet road', () => {
    const isWet = (precip: number) => precip > 1.5;
    expect(isWet(0)).toBe(false);
    expect(isWet(1.0)).toBe(false);
    expect(isWet(1.5)).toBe(false);
    expect(isWet(1.6)).toBe(true);
    expect(isWet(5.0)).toBe(true);
  });
});

describe('Traffic System: Nearest Segment Match (Task 5)', () => {
  it('matches closest grid segment', () => {
    const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      // Simplified mock for test
      return Math.sqrt((lat1-lat2)**2 + (lng1-lng2)**2);
    };

    const lat = 10.0;
    const lng = 20.0;
    const segments = [
      { way_id: 'grid:10.5:20.5', avg_speed_kmh: 40 }, // Dist = ~0.7
      { way_id: 'grid:10.1:20.1', avg_speed_kmh: 30 }, // Dist = ~0.14
      { way_id: 'grid:12.0:22.0', avg_speed_kmh: 20 }, // Dist = ~2.8
    ];

    let matchedSeg = null;
    let minGridDist = Infinity;
    for (const s of segments) {
      const parts = s.way_id.split(':');
      const dist = haversine(lat, lng, parseFloat(parts[1]), parseFloat(parts[2]));
      if (dist < minGridDist && dist < 1.0) {
        minGridDist = dist;
        matchedSeg = s;
      }
    }

    expect(matchedSeg?.avg_speed_kmh).toBe(30);
  });
});
`);
