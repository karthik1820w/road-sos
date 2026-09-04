const fs = require('fs');

let apiIndex = fs.readFileSync('api/index.ts', 'utf8');

const uploadReplacement = `
      doc.end();
      doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);
        const reportId = crypto.randomUUID();
        
        let reportUrl = "";
        try {
          // Upload to Supabase Storage
          if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('reports')
              .upload(\`\${reportId}.pdf\`, pdfData, { contentType: 'application/pdf' });
              
            if (!uploadError) {
              const { data: { signedUrl } } = await supabase.storage
                .from('reports')
                .createSignedUrl(\`\${reportId}.pdf\`, 12 * 60 * 60); // 12 hours
              reportUrl = signedUrl;
            }
          }
          
          if (!reportUrl) {
            // Fallback if supabase not available
            reportStore.set(reportId, pdfData);
            setTimeout(() => reportStore.delete(reportId), 12 * 60 * 60 * 1000);
            const hostUrl = \`\${req.headers['x-forwarded-proto'] || req.protocol}://\${req.get('host')}\`;
            reportUrl = \`\${hostUrl}/api/report/\${reportId}.pdf\`;
          }

          const client = getTwilio();
`;

apiIndex = apiIndex.replace(/      doc\.end\(\);\n      doc\.on\('end', async \(\) => \{\n        const pdfData = Buffer\.concat\(buffers\);\n        const reportId = crypto\.randomUUID\(\);\n        reportStore\.set\(reportId, pdfData\);\n        \/\/ Clean up report after 12 hours\n        setTimeout\(\(\) => reportStore\.delete\(reportId\), 12 \* 60 \* 60 \* 1000\);\n        let reportUrl = "";\n        try \{\n          const client = getTwilio\(\);[\s\S]*?reportUrl = `\$\{hostUrl\}\/api\/report\/\$\{reportId\}\.pdf`;\n/g, uploadReplacement);

fs.writeFileSync('api/index.ts', apiIndex);
