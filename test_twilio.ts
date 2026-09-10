import dotenv from "dotenv";
import twilio from "twilio";
dotenv.config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
async function run() {
  try {
    const msg = await client.messages.create({
      body: "Test message",
      from: process.env.TWILIO_FROM_NUMBER,
      to: process.env.Hospital_NUMBER || process.env.POLICE_NUMBER
    });
    console.log("Success! Message SID:", msg.sid);
  } catch (err) {
    console.error("Twilio error:", err);
  }
}
run();
