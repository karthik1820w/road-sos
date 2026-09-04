const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /body: JSON\.stringify\(body\)/g;
code = code.replace(regex, "body: JSON.stringify({ ...body, idempotencyKey: method === 'POST' ? crypto.randomUUID() : undefined })");

fs.writeFileSync('src/App.tsx', code);
