const fs = require('fs');
let apiIndex = fs.readFileSync('api/index.ts', 'utf8');

const target = `      doc.end();
      doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);
        const reportId = crypto.randomUUID();
        reportStore.set(reportId, pdfData);
        // Clean up report after 12 hours
        setTimeout(() => reportStore.delete(reportId), 12 * 60 * 60 * 1000);
        let reportUrl = "";
        try {
          const client = getTwilio();
          const from = process.env.TWILIO_FROM_NUMBER;
          const hostUrl = \`\${req.headers['x-forwarded-proto'] || req.protocol}://\${req.get('host')}\`;
          reportUrl = \`\${hostUrl}/api/report/\${reportId}.pdf\`;`;

const replacement = `      doc.end();
      doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);
        const reportId = crypto.randomUUID();
        let reportUrl = "";
        try {
          if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('reports')
              .upload(\`\${reportId}.pdf\`, pdfData, { contentType: 'application/pdf' });
              
            if (!uploadError) {
              const { data: { signedUrl } } = await supabase.storage
                .from('reports')
                .createSignedUrl(\`\${reportId}.pdf\`, 12 * 60 * 60);
              reportUrl = signedUrl;
            }
          }
          
          if (!reportUrl) {
            reportStore.set(reportId, pdfData);
            setTimeout(() => reportStore.delete(reportId), 12 * 60 * 60 * 1000);
            const hostUrl = \`\${req.headers['x-forwarded-proto'] || req.protocol}://\${req.get('host')}\`;
            reportUrl = \`\${hostUrl}/api/report/\${reportId}.pdf\`;
          }

          const client = getTwilio();
          const from = process.env.TWILIO_FROM_NUMBER;`;

apiIndex = apiIndex.replace(target, replacement);

fs.writeFileSync('api/index.ts', apiIndex);
