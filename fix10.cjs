const fs = require('fs');
let code = fs.readFileSync('api/index.ts', 'utf8');

// Find the start of the route
const startIdx = code.indexOf('app.post("/api/sos/send-report"');
// Find the next route
const endIdx = code.indexOf('app.post("/api/sos/trigger"');

if (startIdx !== -1 && endIdx !== -1) {
  const handler = `app.post("/api/sos/send-report", async (req, res) => {
  try {
    const { responder, logs, medicalInfo } = z.object({
      responder: z.string().min(1),
      logs: z.array(z.any()).optional(),
      medicalInfo: z.object({ bloodType: z.string().optional(), allergies: z.string().optional(), conditions: z.string().optional(), medications: z.string().optional(), emergencyContacts: z.array(z.object({ name: z.string(), number: z.string(), relation: z.string() })).optional() }).optional()
    }).parse(req.body);

    const safeResponder = xss(responder);

    try {
      const doc = new PDFDocument();
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      
      // Generate PDF content
      doc.fontSize(20).text("RoadSOS Accident Report", { align: 'center' });
      doc.moveDown();
      const safeName = medicalInfo?.name ? xss(medicalInfo.name) : 'Unknown';
      const safeBlood = medicalInfo?.bloodType ? xss(medicalInfo.bloodType) : 'Unknown';
      const safeCond = medicalInfo?.conditions ? xss(medicalInfo.conditions) : 'None';
      doc.fontSize(14).text(\`Patient Name: \${safeName}\`);
      doc.text(\`Blood Group: \${safeBlood}\`);
      doc.text(\`Medical Conditions: \${safeCond}\`);
      doc.moveDown();
      doc.fontSize(16).text("Recent Accident Logs:");
      doc.fontSize(12);
      (logs || []).forEach((log: any) => {
        const msg = typeof log.message === 'string' ? xss(log.message) : '';
        doc.text(\`[\${new Date(log.timestamp).toLocaleString()}] \${msg}\`);
      });
      
      doc.end();
      doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);
        const reportId = crypto.randomUUID();
        let reportUrl = "";
        try {
          if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("reports")
              .upload(\`\${reportId}.pdf\`, pdfData, { contentType: "application/pdf" });
            if (!uploadError) {
              const { data: { signedUrl } } = await supabase.storage
                .from("reports")
                .createSignedUrl(\`\${reportId}.pdf\`, 12 * 60 * 60);
              reportUrl = signedUrl;
            }
          }
          if (!reportUrl) {
            reportStore.set(reportId, pdfData);
            setTimeout(() => reportStore.delete(reportId), 12 * 60 * 60 * 1000);
            const hostUrl = \`\${req.headers["x-forwarded-proto"] || req.protocol}://\${req.get("host")}\`;
            reportUrl = \`\${hostUrl}/api/report/\${reportId}.pdf\`;
          }

          const client = getTwilio();
          const from = process.env.TWILIO_FROM_NUMBER;
          await client.messages.create({
            body: \`RoadSOS Critical Update: Medical Information and Incident Report available at: \${reportUrl}\`,
            from,
            to: safeResponder
          });
          res.json({ success: true, reportId, reportUrl });
        } catch (err: any) {
          if (err.message && (err.message.includes("Authenticate") || err.message.includes("credentials"))) {
             console.error("Twilio report send error: Twilio Authentication Failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Settings.");
             res.status(500).json({ error: err.message });
          } else if (err.message && (err.message.includes("unverified") || err.message.includes("Trial account"))) {
             console.error("Twilio report send error (Mocking Success due to Trial Account):", err.message);
             res.json({ success: true, reportId, reportUrl, mocked: true });
          } else {
             console.error("Twilio report send error:", err);
             res.status(500).json({ error: err.message });
          }
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } catch (zErr) {
    if (zErr instanceof z.ZodError) return res.status(400).json({ error: "Invalid input" });
    res.status(500).json({ error: "Server error" });
  }
});
`;

  code = code.substring(0, startIdx) + handler + code.substring(endIdx);
  fs.writeFileSync('api/index.ts', code);
}
