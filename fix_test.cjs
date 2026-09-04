const fs = require('fs');

let testCode = fs.readFileSync('tests/traffic-api.test.ts', 'utf8');

testCode = `import { describe, it, expect, vi, beforeEach } from 'vitest';\n` + testCode;

testCode = testCode.replace(/global\.fetch = jest\.fn\(\);/g, 'global.fetch = vi.fn();');
testCode = testCode.replace(/\(global\.fetch as jest\.Mock\)/g, '(global.fetch as ReturnType<typeof vi.fn>)');
fs.writeFileSync('tests/traffic-api.test.ts', testCode);

// Add "test": "vitest run" to package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts.test = "vitest run";
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

