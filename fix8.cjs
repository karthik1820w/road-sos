const fs = require('fs');
let code = fs.readFileSync('api/index.ts', 'utf8');

code = code.replace(`      doc.on("end", async () => {
        const pdfData = Buffer.concat(buffers);
        const reportId = crypto.randomUUID();
      doc.on('end', async () => {
        let reportUrl = "";`, `      doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);
        const reportId = crypto.randomUUID();
        let reportUrl = "";`);

fs.writeFileSync('api/index.ts', code);
