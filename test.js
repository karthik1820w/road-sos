fetch('http://localhost:3000/api/ai/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'help' }) })
  .then(async r => console.log(r.status, await r.json()))
  .catch(console.error);
