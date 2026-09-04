const fs = require('fs');
let code = fs.readFileSync('api/index.ts', 'utf8');

const loggerFunc = `
const logEmergencyAction = async (action: string, payload: any) => {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const logEntry = {
        serialized_payload: JSON.stringify(payload || {}),
        facility_name: "RoadSOS System",
        lat: 0,
        lng: 0,
        injury_tag: action
      };
      await supabase.from("emergency_logs").insert([logEntry]);
    } catch (e) {
      console.error("Failed to log emergency action", e);
    }
  }
};
`;

// Insert after Supabase Config
const target = "const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);";
code = code.replace(target, target + "\n" + loggerFunc);

// Now let's add calls to this logger in the endpoints
code = code.replace(
  'app.post("/api/emergencies/confirm", (req, res) => {',
  'app.post("/api/emergencies/confirm", (req, res) => { logEmergencyAction("CONFIRM", req.body);'
);

code = code.replace(
  'app.post("/api/emergencies/confirmation-reset", (req, res) => {',
  'app.post("/api/emergencies/confirmation-reset", (req, res) => { logEmergencyAction("CANCEL", req.body);'
);

code = code.replace(
  'app.post("/api/sos/send-report", async (req, res) => {',
  'app.post("/api/sos/send-report", async (req, res) => { logEmergencyAction("REPORT_SENT", req.body);'
);

code = code.replace(
  'app.post("/api/sos/notify", async (req, res) => {',
  'app.post("/api/sos/notify", async (req, res) => { logEmergencyAction("NOTIFY_SMS", req.body);'
);

code = code.replace(
  'app.post("/api/sos/call-neon", async (req, res) => {',
  'app.post("/api/sos/call-neon", async (req, res) => { logEmergencyAction("CALL_NEON", req.body);'
);

code = code.replace(
  'app.post("/api/sos/call-initiate", async (req, res) => {',
  'app.post("/api/sos/call-initiate", async (req, res) => { logEmergencyAction("CALL_INITIATE", req.body);'
);

fs.writeFileSync('api/index.ts', code);
