async function run() {
  const token = "test-device-token-123";
  const headers = { "Content-Type": "application/json", "X-Device-Token": token };
  
  const createRes = await fetch("http://localhost:3000/api/incidents", {
    method: "POST",
    headers,
    body: JSON.stringify({ kind: "MANUAL_SOS", reason: "Test", patient: { name: "Test" }, contacts: [] })
  });
  const { incident } = await createRes.json();
  console.log("Created:", incident.id);
  
  const dispatchRes = await fetch("http://localhost:3000/api/incidents/\/dispatch", { method: "POST", headers });
  const text = await dispatchRes.text();
  console.log("Dispatch Response Status:", dispatchRes.status);
  console.log("Dispatch Response Text:", text);
}
run();
