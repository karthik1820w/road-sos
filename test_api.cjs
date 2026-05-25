const https = require('https');

const data = JSON.stringify({
  includedTypes: ["hospital"],
  maxResultCount: 5,
  locationRestriction: {
    circle: { center: { latitude: 12.9716, longitude: 77.5946 }, radius: 50000.0 }
  },
  rankPreference: "DISTANCE"
});

const options = {
  hostname: 'places.googleapis.com',
  path: '/v1/places:searchNearby',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || '',
    'X-Goog-FieldMask': 'places.displayName,places.location',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let body = '';
  res.on('data', d => {
    body += d;
  });
  res.on('end', () => console.log(body));
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
