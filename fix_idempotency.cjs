const fs = require('fs');
let code = fs.readFileSync('api/index.ts', 'utf8');

const cacheSetup = `
const idempotencyCache = new Set<string>();
function checkIdempotency(req: any) {
  const key = req.headers["x-idempotency-key"] || req.body?.idempotencyKey;
  if (key) {
    if (idempotencyCache.has(key)) return true;
    idempotencyCache.add(key);
    setTimeout(() => idempotencyCache.delete(key), 60000);
  }
  return false;
}
`;

// Insert cache setup around line 770
const target = 'app.post("/api/sos/send-report", async (req, res) => {';
code = code.replace(target, cacheSetup + '\n' + target);

// Add to notify
const notifyTarget = 'app.post("/api/sos/notify", async (req, res) => { logEmergencyAction("NOTIFY_SMS", req.body);';
code = code.replace(notifyTarget, notifyTarget + '\n  if (checkIdempotency(req)) return res.json({ success: true, cached: true });');

// Add to call-neon
const callNeonTarget = 'app.post("/api/sos/call-neon", async (req, res) => { logEmergencyAction("CALL_NEON", req.body);';
code = code.replace(callNeonTarget, callNeonTarget + '\n  if (checkIdempotency(req)) return res.json({ success: true, cached: true });');

// Add to call-initiate
const callInitiateTarget = 'app.post("/api/sos/call-initiate", async (req, res) => { logEmergencyAction("CALL_INITIATE", req.body);';
code = code.replace(callInitiateTarget, callInitiateTarget + '\n  if (checkIdempotency(req)) return res.json({ success: true, cached: true });');

fs.writeFileSync('api/index.ts', code);
