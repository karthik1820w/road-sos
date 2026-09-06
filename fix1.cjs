const fs = require('fs');

let apiIndex = fs.readFileSync('api/index.ts', 'utf8');
apiIndex = apiIndex.replace('{ q: "hello", a: "HEILO bob how are you doing!" },\n', '');
apiIndex = apiIndex.replace('res.write(`data: ${JSON.stringify({ chunk: "HEILO bob how are you doing!" })}\\n\\n`);', 'res.write(`data: ${JSON.stringify({ chunk: "Hello! I am your AI assistant. How can I help?" })}\\n\\n`);');
apiIndex = apiIndex.replace('return res.json({ answer: "HEILO bob how are you doing!" });', 'return res.json({ answer: "Hello! I am your AI assistant. How can I help?" });');

apiIndex = apiIndex.replace('twiml.say("Bob is driving and will reach to you later.");', 'twiml.say("The driver is currently operating a vehicle and will reach out to you later.");');
apiIndex = apiIndex.replace('twiml.say("Connecting you to Bob.");', 'twiml.say("Connecting you to the driver.");');

apiIndex = "import helmet from 'helmet';\n" + apiIndex;
apiIndex = apiIndex.replace('// Global API Limiter to prevent basic scraping and abuse', 'app.use(helmet());\n// Global API Limiter to prevent basic scraping and abuse');
apiIndex = apiIndex.replace('// app.use("/api/", apiLimiter);', 'app.use("/api/", apiLimiter);');
apiIndex = apiIndex.replace('// app.use("/api/ai/", aiLimiter);', 'app.use("/api/ai/", aiLimiter);');
fs.writeFileSync('api/index.ts', apiIndex);

let apiAuth = fs.readFileSync('api/auth.ts', 'utf8');
apiAuth = apiAuth.replace("const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secure-secret-do-not-use-in-production';", "const JWT_SECRET = process.env.JWT_SECRET;\nif (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');");
apiAuth = apiAuth.replace(/    if \(error\) \{\n       if \(error\.code === '42P01'\) \{[\s\S]*?throw error;\n    \}/g, '    if (error) throw error;');
apiAuth = apiAuth.replace(/     if \(error\.code === '42P01'\) \{[\s\S]*?\}\n/g, '');
fs.writeFileSync('api/auth.ts', apiAuth);
