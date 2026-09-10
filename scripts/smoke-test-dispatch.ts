import dotenv from "dotenv";
import twilio from "twilio";
dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
async function runTest() {
  console.log("=== ROAD SOS END-TO-END DISPATCH SMOKE TEST ===");
  try {
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    const testToNumber = process.env.TWILIO_FROM_NUMBER || process.env.Hospital_NUMBER || process.env.POLICE_NUMBER;
    
    if (!fromNumber) throw new Error("Missing TWILIO_FROM_NUMBER");
    
    console.log("Attempting to send SMS from \ to \...");
    
    const msg = await client.messages.create({
      body: "ROAD SOS SMOKE TEST: This is a diagnostic test of the Twilio dispatch system.",
      from: fromNumber,
      to: testToNumber
    });
    console.log("[SUCCESS] SMS queued/sent! SID: \");
    
    console.log("Attempting to initiate Call from \ to \...");
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ loop: 2 }, "Road S O S Smoke test. This is a diagnostic call. The system is functioning normally. Goodbye.");
    const call = await client.calls.create({
      to: testToNumber,
      from: fromNumber,
      twiml: twiml.toString()
    });
    console.log("[SUCCESS] Call initiated! SID: \");
  } catch (err: any) {
    console.error("[FAILED] Twilio dispatch failed:", err.message || err);
  }
}
runTest();
