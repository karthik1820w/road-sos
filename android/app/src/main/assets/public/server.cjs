"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_supabase_js = require("@supabase/supabase-js");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_twilio = __toESM(require("twilio"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json());
var aiClient = null;
var getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  if (!aiClient) {
    aiClient = new import_genai.GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiClient;
};
var TRAINED_QA = [
  { q: "What should you do first after witnessing a road accident?", a: "Ensure your own safety, move to a safe location, and call emergency services immediately." },
  { q: "What should you do if a biker is unconscious after a crash?", a: "Check breathing and pulse without moving the neck or spine unnecessarily." },
  { q: "What is the first aid for severe bleeding in a road accident?", a: "Apply firm pressure on the wound using a clean cloth or bandage to stop bleeding." },
  { q: "What should you do if a car accident victim is trapped inside the vehicle?", a: "Do not pull them out unless there is fire or immediate danger. Call emergency responders." },
  { q: "What is the first aid for fractures after a bike accident?", a: "Keep the injured limb still and support it using a splint or cloth." },
  { q: "What should you do if someone is bleeding from the head after an accident?", a: "Apply gentle pressure with a clean cloth unless a skull fracture is suspected." },
  { q: "What is the first aid for road rash injuries?", a: "Wash the wound gently with clean water and cover it with a sterile dressing." },
  { q: "What should you do if a victim is not breathing after a road accident?", a: "Begin CPR immediately and continue until medical help arrives." },
  { q: "What is the first aid for burns caused by vehicle fires?", a: "Cool the burn under running water for at least 10 minutes and cover it loosely." },
  { q: "What should you do if someone has neck pain after a collision?", a: "Keep the person still and avoid moving the head or neck." },
  { q: "What is the first aid for shock after a road accident?", a: "Lay the person down, keep them warm, and reassure them until help arrives." },
  { q: "What should you do if a victim has chest pain after a crash?", a: "Keep them calm and seek emergency medical help immediately." },
  { q: "What is the first aid for a broken leg after a vehicle accident?", a: "Immobilize the leg and avoid unnecessary movement." },
  { q: "What should you do if fuel is leaking from a crashed vehicle?", a: "Move everyone away from the vehicle and avoid sparks or flames." },
  { q: "What is the first aid for eye injuries caused by shattered glass?", a: "Do not rub the eye and seek immediate medical attention." },
  { q: "What should you do if a person faints after a road accident?", a: "Lay them flat on their back and raise their legs slightly." },
  { q: "What is the first aid for a spinal injury in a road accident?", a: "Keep the victim completely still and wait for trained medical personnel." },
  { q: "What should you do if a helmeted biker is unconscious?", a: "Do not remove the helmet unless necessary for CPR or breathing support." },
  { q: "What is the first aid for deep cuts caused by metal or glass?", a: "Apply pressure to stop bleeding and cover the wound with a clean dressing." },
  { q: "What should you do if someone is having difficulty breathing after a crash?", a: "Help them sit upright and loosen tight clothing while waiting for help." },
  { q: "What is the first aid for swelling after a bike accident?", a: "Apply a cold pack wrapped in cloth to reduce swelling." },
  { q: "What should you do if a victim is vomiting after a head injury?", a: "Turn them carefully onto their side while keeping the neck supported." },
  { q: "What is the first aid for unconscious accident victims who are breathing?", a: "Place them in the recovery position while monitoring breathing." },
  { q: "What should you do if someone has glass embedded in a wound?", a: "Do not remove large glass pieces and seek medical help immediately." },
  { q: "What is the first aid for a dislocated shoulder after a crash?", a: "Keep the arm still using a sling and avoid forcing it back into place." },
  { q: "What should you do if a road accident victim is panicking?", a: "Speak calmly, reassure them, and encourage slow breathing." },
  { q: "What is the first aid for internal bleeding suspicion after an accident?", a: "Lay the person down, keep them still, and seek emergency medical care immediately." },
  { q: "What should you do if a pedestrian is hit by a vehicle?", a: "Call emergency services and avoid moving them unless there is danger." },
  { q: "What is the first aid for hand injuries caused by road accidents?", a: "Clean minor wounds and bandage them while keeping the hand elevated." },
  { q: "there is a bleeding", a: "Apply firm pressure on the wound with a clean cloth to stop bleeding and seek medical help if the bleeding is severe." },
  { q: "i am bleeding", a: "Apply firm pressure on the wound with a clean cloth to stop bleeding and seek medical help if the bleeding is severe." },
  { q: "i have a headache", a: "Rest in a quiet place, drink water, avoid screen exposure, and seek medical help if the headache becomes severe." },
  { q: "fracture or swelling in his hands or legs", a: "Keep the injured hand or leg still, apply ice to reduce swelling, avoid movement, and seek medical help immediately if a fracture is suspected." },
  { q: "fracture or swelling", a: "Keep the injured hand or leg still, apply ice to reduce swelling, avoid movement, and seek medical help immediately if a fracture is suspected." },
  { q: "What should you do if an accident victim stops responding during transport?", a: "Stop safely, check breathing and pulse, and begin CPR if necessary." }
];
var findTrainedAnswer = (userInput) => {
  const cleanInput = userInput.toLowerCase().trim().replace(/[?,.!-]/g, "");
  for (const qa of TRAINED_QA) {
    const cleanQ = qa.q.toLowerCase().trim().replace(/[?,.!-]/g, "");
    if (cleanInput.includes(cleanQ) || cleanQ.includes(cleanInput)) {
      return qa.a;
    }
  }
  const inputWords = cleanInput.split(/\s+/).filter((w) => w.length > 2);
  if (inputWords.length === 0) return null;
  let bestMatch = null;
  let highestScore = 0;
  for (const qa of TRAINED_QA) {
    const cleanQ = qa.q.toLowerCase().trim().replace(/[?,.!-]/g, "");
    const qWords = cleanQ.split(/\s+/).filter((w) => w.length > 2);
    let matchCount = 0;
    for (const word of inputWords) {
      if (qWords.includes(word)) {
        matchCount++;
      }
    }
    const score = matchCount / Math.max(inputWords.length, qWords.length);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = qa;
    }
  }
  if (highestScore > 0.24 && bestMatch) {
    console.log(`[Trained Match Found] Question "${userInput}" matched layout "${bestMatch.q}" with score ${highestScore.toFixed(3)}`);
    return bestMatch.a;
  }
  return null;
};
var EMERGENCY_DATASET = `
TRAINED ROAD ACCIDENT FIRST AID KNOWLEDGE DATASET:
${TRAINED_QA.map((qa, i) => `Q${i + 1}: ${qa.q}
A${i + 1}: ${qa.a}`).join("\n\n")}
`;
var KNOWLEDGE_BASE_CONTEXT = `
  ROAD SAFETY PROTOCOLS:
  1. Always prioritize life safety.
  2. In critical accidents, do not move the victim unless there is imminent danger.
  3. Ensure the scene is visible to other traffic using blinkers or flares.
  
  ${EMERGENCY_DATASET}
`;
var generateAIResponse = async (prompt, isHighPriority = false) => {
  const maxRetries = 3;
  let lastError = null;
  let localFallbackTip = findTrainedAnswer(prompt) || "Ensure safety, check breathing and pulse, apply firm pressure to wounds to stop bleeding, and wait for emergency services.";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        // Using stable latest flash for reliability
        contents: prompt,
        config: {
          maxOutputTokens: isHighPriority ? 120 : 300,
          temperature: 0.1,
          systemInstruction: "EMERGENCY PROTOCOL: You are a trained first aid assistant. Match the user question or statement to the provided dataset of questions and answers. Reply with the EXACT answer text from the dataset. DO NOT add any introduction, greeting, conversational filler, or extra advisory remarks."
        }
      });
      const text = response.text;
      if (text) return text;
      throw new Error("Empty response from AI");
    } catch (error) {
      lastError = error;
      const errorMsg = error.message || "";
      const isTransient = errorMsg.includes("503") || errorMsg.includes("500") || errorMsg.includes("high demand") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("INTERNAL") || errorMsg.includes("overloaded") || errorMsg.includes("Empty response");
      if (isTransient && attempt < maxRetries) {
        const baseDelay = isHighPriority ? 800 : 1500;
        const delay = Math.pow(1.5, attempt) * baseDelay + Math.random() * 300;
        console.warn(`\u26A0\uFE0F Gemini API Retry (${attempt + 1}/${maxRetries}) in ${Math.round(delay)}ms: ${errorMsg}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      console.error("\u274C Gemini API Error:", errorMsg);
      break;
    }
  }
  return localFallbackTip;
};
app.post("/api/ai/ask", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "Question is required" });
  try {
    if (question.toLowerCase().trim() === "hello") {
      return res.json({ answer: "Hello! How can I help you?" });
    }
    const trainedAns = findTrainedAnswer(question);
    if (trainedAns) {
      console.log(`[Ask API] Intercepted and answered directly using trained Q&As for: "${question}"`);
      return res.json({ answer: trainedAns });
    }
    const isEmergency = question.includes("EMERGENCY FIRST AID REQUEST");
    const prompt = isEmergency ? `${EMERGENCY_DATASET}

USER REQUEST: ${question}

INSTRUCTION: Provide ONLY the immediate life-saving steps. NO introduction. BE CONCISE.` : `${KNOWLEDGE_BASE_CONTEXT}

User Question: ${question}

Instruction: Provide a helpful, concise answer.`;
    const answer = await generateAIResponse(prompt, isEmergency);
    res.json({ answer });
  } catch (error) {
    console.error("\u274C AI Error:", error.message);
    res.status(500).json({ error: "AI Assistant Failure" });
  }
});
var isDrivingModeActive = false;
var lastConfirmation = { confirmed: false, responder: "", timestamp: 0 };
app.get("/api/emergencies/confirmation-status", (req, res) => {
  res.json(lastConfirmation);
});
app.post("/api/emergencies/confirm", (req, res) => {
  const { responder = "Regional Trauma Center" } = req.body;
  lastConfirmation = {
    confirmed: true,
    responder,
    timestamp: Date.now()
  };
  console.log(`[Status] Manual confirmation received from: ${responder}`);
  res.json({ success: true, lastConfirmation });
});
app.post("/api/emergencies/confirmation-reset", (req, res) => {
  lastConfirmation = { confirmed: false, responder: "", timestamp: 0 };
  res.json({ success: true });
});
app.post("/api/twilio/sms", (req, res) => {
  const body = (req.body.Body || "").toLowerCase().trim();
  const from = req.body.From || "Emergency Dispatch";
  console.log(`[Twilio Webhook] Received SMS reply: "${body}" from ${from}`);
  const keywords = ["yes", "ok", "confirm", "coming", "on my way", "arrival", "ack", "active", "help", "en route", "dispatched", "will attend", "1"];
  const isConfirmed = keywords.some((kw) => body.includes(kw)) || body === "1";
  const twiml = new import_twilio.default.twiml.MessagingResponse();
  if (isConfirmed) {
    lastConfirmation = {
      confirmed: true,
      responder: from,
      timestamp: Date.now()
    };
    twiml.message(`RoadSOS: Acknowledged. We are transmitting confirmation to the victim that help is arriving.`);
  } else {
    twiml.message(`RoadSOS Emergency: Response ignored or not understood. Send 'YES', 'OK', or '1' to confirm dispatch.`);
  }
  res.type("text/xml");
  res.send(twiml.toString());
});
app.post("/api/twilio/call-gather", (req, res) => {
  const digits = req.body.Digits;
  console.log(`[Twilio Call Gather] Keypress digit received: ${digits}`);
  const twiml = new import_twilio.default.twiml.VoiceResponse();
  if (digits === "1") {
    lastConfirmation = {
      confirmed: true,
      responder: "Ambulance Driver (+917892375787)",
      timestamp: Date.now()
    };
    twiml.say("Thank you. Dispatch confirmation has been recorded. Help is on the way.");
  } else {
    twiml.say("Option not recognized. Goodbye.");
  }
  res.type("text/xml");
  res.send(twiml.toString());
});
app.post("/api/status/driving", (req, res) => {
  const { active } = req.body;
  isDrivingModeActive = !!active;
  console.log(`[Status] Driving Mode: ${isDrivingModeActive ? "ENABLED" : "DISABLED"}`);
  res.json({ success: true, isDrivingModeActive });
});
app.post("/api/twilio/voice", (req, res) => {
  console.log(`[Twilio Webhook] Received voice request. Driving Mode Active: ${isDrivingModeActive}`);
  const twiml = new import_twilio.default.twiml.VoiceResponse();
  if (isDrivingModeActive) {
    twiml.say("The person you are calling is currently driving and has Road SOS protection active. They will be notified of your call when they reach their destination safely.");
    twiml.hangup();
  } else {
    twiml.say("Connecting you to the Road SOS user.");
    twiml.say("The user is currently available but Road SOS is in monitoring mode. Please try later or use the distress frequency.");
  }
  res.type("text/xml");
  res.send(twiml.toString());
});
var SUPABASE_URL = process.env.SUPABASE_URL || "";
var SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
var supabase = (0, import_supabase_js.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
var twilioClient = null;
var getTwilio = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("Twilio credentials missing.");
  }
  if (!twilioClient) {
    twilioClient = (0, import_twilio.default)(sid, token);
  }
  return twilioClient;
};
app.post("/api/emergencies/log", async (req, res) => {
  const { details, location, type } = req.body;
  try {
    const logEntry = {
      serialized_payload: JSON.stringify(details || {}),
      facility_name: details?.facility || "Unknown",
      lat: location?.lat || 0,
      lng: location?.lng || 0,
      injury_tag: type || "voice_interaction"
    };
    const { data, error } = await supabase.from("emergency_logs").insert([logEntry]);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error("\u274C Supabase Log Error:", error.message);
    res.status(500).json({ error: "Storage Failure" });
  }
});
app.post("/api/ai/voice-process", async (req, res) => {
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: "Transcript required" });
  try {
    const trainedAns = findTrainedAnswer(transcript);
    if (trainedAns) {
      console.log(`[Voice Process] Intercepted and answered directly using trained Q&As for: "${transcript}"`);
      return res.json({ mode: "TRAINING", content: trainedAns, original_transcript: transcript });
    }
    const prompt = `
      You are a high-speed emergency response AI.
      Analyze: "${transcript}"
      
      OUTPUT FORMAT:
      [MODE: EMERGENCY/TRAINING/GENERAL]
      Content: [Short, direct response. Under 30 words.]

      Context: ${KNOWLEDGE_BASE_CONTEXT}
    `;
    const text = await generateAIResponse(prompt, true);
    let mode = "GENERAL";
    if (text.includes("[MODE: EMERGENCY]")) mode = "EMERGENCY";
    else if (text.includes("[MODE: TRAINING]")) mode = "TRAINING";
    res.json({ mode, content: text.replace(/\[MODE: .*?\]/, "").replace(/Content:/, "").trim(), original_transcript: transcript });
  } catch (error) {
    console.error("\u274C AI Error:", error);
    res.status(500).json({ error: "AI failure" });
  }
});
app.post("/api/emergencies/notify", async (req, res) => {
  lastConfirmation = { confirmed: false, responder: "", timestamp: 0 };
  const { recipients, message } = req.body;
  console.log(`[SMS] Attempting to notify: ${recipients}`);
  if (!recipients || !Array.isArray(recipients) || !message) {
    return res.status(400).json({ error: "Recipients (array) and message required" });
  }
  try {
    const client = getTwilio();
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!from) {
      console.error("[SMS] Error: TWILIO_FROM_NUMBER is not set.");
      throw new Error("TWILIO_FROM_NUMBER is missing");
    }
    const results = await Promise.allSettled(
      recipients.map((to) => {
        const formattedTo = to.trim().startsWith("+") ? to.trim() : `+${to.trim()}`;
        console.log(`[SMS] Sending to: ${formattedTo} from: ${from}`);
        return client.messages.create({
          body: message,
          to: formattedTo,
          from
        });
      })
    );
    console.log("[SMS] Results:", JSON.stringify(results));
    res.json({ success: true, results });
  } catch (error) {
    console.error("\u274C Twilio SMS Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/calls/initiate", async (req, res) => {
  const { to = "+917892375787", message } = req.body;
  console.log(`[Call] Attempting to call: ${to}`);
  try {
    const client = getTwilio();
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!from) {
      console.error("[Call] Error: TWILIO_FROM_NUMBER is not set.");
      throw new Error("TWILIO_FROM_NUMBER is missing");
    }
    const formattedTo = to.trim().startsWith("+") ? to.trim() : `+${to.trim()}`;
    console.log(`[Call] Dialing: ${formattedTo} from: ${from}`);
    const hostUrl = `${req.protocol}://${req.get("host")}`;
    const twimlString = `<Response>
      <Gather numDigits="1" action="${hostUrl}/api/twilio/call-gather" timeout="10" method="POST">
        <Say>${message} Please press 1 if help is arriving to confirm dispatch.</Say>
      </Gather>
      <Say>We did not receive confirmation. We will alert other units. Thank you.</Say>
    </Response>`;
    const call = await client.calls.create({
      twiml: twimlString,
      to: formattedTo,
      from
    });
    console.log(`[Call] SID: ${call.sid}`);
    res.json({ success: true, callSid: call.sid });
  } catch (error) {
    console.error("\u274C Twilio Call Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(import_express.default.static(import_path.default.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(process.cwd(), "dist", "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
