import fetch from 'node-fetch';
async function test() {
  const req = await fetch('http://localhost:3000/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'What is the current time and weather?' })
  });
  const data = await req.json();
  console.log(data);
}
test();
