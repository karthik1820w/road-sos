import fetch from 'node-fetch';

async function test() {
    try {
        const res = await fetch('http://localhost:3000/api/ai/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: 'I cut my finger and it is bleeding, what to do?' })
        });
        console.log(await res.json());
    } catch (e) {
        console.error(e);
    }
}
test();
