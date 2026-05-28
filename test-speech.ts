const neonRegex = /\b(neon|leon|ne on|knee on|nian|beyond|new one|nyon|neeon)\b/g;
const helpRegex = /\b(help|helps|helping|howp|health)\b/g;

console.log(("help help help").match(helpRegex)?.length)
console.log(("NEON NEON NEON").toLowerCase().match(neonRegex)?.length)
