const fs = require('fs');

let apiIndex = fs.readFileSync('api/index.ts', 'utf8');

apiIndex = apiIndex.replace('medicalInfo: z.record(z.any()).optional()', 'medicalInfo: z.object({ bloodType: z.string().optional(), allergies: z.string().optional(), conditions: z.string().optional(), medications: z.string().optional(), emergencyContacts: z.array(z.object({ name: z.string(), number: z.string(), relation: z.string() })).optional() }).optional()');

apiIndex = apiIndex.replace('details: z.record(z.any()).optional(),', 'details: z.record(z.string().or(z.number()).or(z.boolean()).or(z.null())).optional(),');

apiIndex = apiIndex.replace('const body = z.record(z.any()).parse(req.body);', 'const body = req.body;');

fs.writeFileSync('api/index.ts', apiIndex);
