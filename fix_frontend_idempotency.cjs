const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  "body: JSON.stringify(body)",
  "body: JSON.stringify({ ...body, idempotencyKey: method === 'POST' ? crypto.randomUUID() : undefined })"
);

fs.writeFileSync('src/App.tsx', code);
