const fetch = require('node-fetch');
async function test() {
  const url = `https://places.googleapis.com/v1/places:searchNearby`;
  const headers = { 
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || '',
    'X-Goog-FieldMask': 'places.displayName,places.location'
  };
  const body = {
    includedTypes: ["hospital"],
    maxResultCount: 5,
    locationRestriction: {
      circle: { center: { latitude: 12.9716, longitude: 77.5946 }, radius: 50000.0 }
    },
    rankPreference: "DISTANCE"
  };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  console.log(res.status);
  console.log(await res.text());
}
test();
