const fs = require('fs');
let content = fs.readFileSync('src/components/VoiceInterface.tsx', 'utf8');

const regex1 = /const recipients = \["\+916361892311", "\+917892375787"\];/g;
const replace1 = `const medicalInfoStr = localStorage.getItem("roadsos_medical");
      const mInfo = medicalInfoStr ? JSON.parse(medicalInfoStr) : { emergencyContacts: [] };
      const mappedContacts = (mInfo.emergencyContacts || []).map((c: any) => c.number).filter((n: string) => n && /^\\+?[\\d\\s()-]{7,20}$/.test(n));
      const recipients = mappedContacts.length > 0 ? mappedContacts : ["+916361892311"];`;

const regex2 = /const numbersToCall = \["\+916361892311", "\+917892375787"\];/g;
const replace2 = `const numbersToCall = recipients;`;

content = content.replace(regex1, replace1);
content = content.replace(regex2, replace2);

content = content.replace(/\/api\/emergencies\/notify/g, '/api/sos/notify');
content = content.replace(/\/api\/calls\/initiate/g, '/api/sos/call-initiate');

fs.writeFileSync('src/components/VoiceInterface.tsx', content);
