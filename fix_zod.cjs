const fs = require('fs');
let code = fs.readFileSync('api/index.ts', 'utf8');

code = code.replace(
  'logs: z.array(z.any()).optional(),',
  'logs: z.array(z.object({ timestamp: z.string().or(z.number()), message: z.string(), type: z.string().optional() })).optional(),'
);

code = code.replace(
  'history: z.array(z.any()).optional()',
  'history: z.array(z.object({ role: z.string(), parts: z.array(z.object({ text: z.string() })) })).optional()'
);

code = code.replace(
  'const body = z.record(z.any()).parse(req.body);',
  'const body = req.body;'
);

fs.writeFileSync('api/index.ts', code);
