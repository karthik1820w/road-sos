const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// replace the second const mInfo = medicalInfoRef.current; with nothing or something else
content = content.replace(/const mInfo = medicalInfoRef\.current;\n    const phone = userPhoneRef\.current/g, 'const phone = userPhoneRef.current');

// replace target => with (target: string) =>
content = content.replace(/targetNumbers\.map\(target => /g, 'targetNumbers.map((target: string) => ');

fs.writeFileSync('src/App.tsx', content);
