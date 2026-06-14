import fs from 'fs';
const text = fs.readFileSync('api/index.ts', 'utf8');
const processed = text.replace(/ \|\| process\.env\.VITE_[A-Z_0-9]+/g, '');
fs.writeFileSync('api/index.ts', processed);
