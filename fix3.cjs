const fs = require('fs');

let apiIndex = fs.readFileSync('api/index.ts', 'utf8');

const healthEndpoint = `
import { authenticateToken } from "./auth.js";
app.get('/api/health', authenticateToken, async (req, res) => {
  const start = performance.now();
  const status = {
    twilio: 'down',
    gemini: 'down',
    supabase: 'down',
    maps: 'down',
    latencyMs: 0
  };

  try {
    // Ping Gemini
    const aiResponse = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\${process.env.GEMINI_API_KEY}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
    });
    if (aiResponse.ok) status.gemini = 'ok';
    else status.gemini = 'degraded';
  } catch (e) { }

  try {
    // Ping Supabase
    if (process.env.SUPABASE_URL) {
      const sbResponse = await fetch(\`\${process.env.SUPABASE_URL}/rest/v1/\`, {
        headers: { 'apikey': process.env.SUPABASE_ANON_KEY || '' }
      });
      if (sbResponse.ok) status.supabase = 'ok';
      else status.supabase = 'degraded';
    }
  } catch (e) { }

  status.latencyMs = Math.round(performance.now() - start);
  res.json(status);
});
`;

apiIndex = apiIndex.replace('const app = express();', 'const app = express();\n' + healthEndpoint);

fs.writeFileSync('api/index.ts', apiIndex);
