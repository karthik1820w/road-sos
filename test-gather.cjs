const http = require('http');

const data = new URLSearchParams({
  'Digits': '1'
}).toString();

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/twilio/call-gather',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, res => {
  console.log(`Command statusCode: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
