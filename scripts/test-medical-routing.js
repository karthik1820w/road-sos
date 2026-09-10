async function runTest() {
  const token = "test-device-token-123";
  const headers = { "Content-Type": "application/json", "X-Device-Token": token };
  console.log("1. Creating incident with a mock medical profile contact (+919876543210)...");
  const createRes = await fetch("http://localhost:3000/api/incidents", { method: "POST", headers, body: JSON.stringify({ kind: "CRASH", reason: "Testing Medical Profile Contact Routing", contacts: ["+919876543210"] }) });
  const { incident } = await createRes.json();
  console.log("2. Incident Created! ID:", incident.id);
  console.log("3. Dispatching incident to test Twilio routing...");
  const dispatchRes = await fetch("http://localhost:3000/api/incidents/" + incident.id + "/dispatch", { method: "POST", headers });
  const data = await dispatchRes.json();
  console.log("\n--- DISPATCH RESULTS ---");
  data.incident.deliveries.forEach(d => {
    console.log(Channel:  | To:  | Status:  );
  });
}
runTest();
