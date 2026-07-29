const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
const regex = /const targetNumbers = \["\+916361892311"\];/g;
const replace = `const mInfo = medicalInfoRef.current;
    const mappedContacts = (mInfo.emergencyContacts || []).map((c: any) => c.number).filter((n: string) => n && /^\\+?[\\d\\s()-]{7,20}$/.test(n));
    const targetNumbers = mappedContacts.length > 0 ? mappedContacts : ["+916361892311"];`;
content = content.replace(regex, replace);
fs.writeFileSync('src/App.tsx', content);
