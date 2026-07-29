const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/const executeDistressBroadcast = async \(reason: string, silent: boolean = false, targetOverride\?: string\) => {/,
  'const executeDistressBroadcast = async (reason: string, silent: boolean = false, targetOverride?: string) => {');

content = content.replace(/const targetNumbers = targetOverride \? \[targetOverride\] : \(mappedContacts\.length > 0 \? mappedContacts : \["\+916361892311"\]\);/g,
  'const targetNumbers = mappedContacts.length > 0 ? mappedContacts : ["+916361892311"];');

content = content.replace(/targetHospitalNumber = forcedTargetNumber; \/\/ Override to strictly call the required specific number, but we kept the fetch logic if we wanted dynamic numbers\./g,
  'targetHospitalNumber = forcedTargetNumber;');

content = content.replace(/await executeDistressBroadcast\(`Emergency dispatch to nearest hospital`, false, targetHospitalNumber\);/g,
  'await executeDistressBroadcast(`Emergency dispatch to nearest hospital`, false);');

fs.writeFileSync('src/App.tsx', content);
