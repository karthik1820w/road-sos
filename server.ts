import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import twilio from "twilio";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("trust proxy", true);

// Expose io to routes if needed
(app as any).io = io;

io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});


// Gemini Configuration
let aiClient: GoogleGenAI | null = null;
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
};

// Traffic Rules and First Aid Context
interface QA {
  q: string;
  a: string;
}

const TRAINED_QA: QA[] = [
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

const findTrainedAnswer = (userInput: string): string | null => {
  const cleanInput = userInput.toLowerCase().trim().replace(/[?,.!-]/g, "");
  
  // 1. Literal exact or clean inclusion check
  for (const qa of TRAINED_QA) {
    const cleanQ = qa.q.toLowerCase().trim().replace(/[?,.!-]/g, "");
    if (cleanInput.includes(cleanQ) || cleanQ.includes(cleanInput)) {
      return qa.a;
    }
  }

  // 2. Keyword/Word overlap check
  const inputWords = cleanInput.split(/\s+/).filter(w => w.length > 2);
  if (inputWords.length === 0) return null;

  let bestMatch: QA | null = null;
  let highestScore = 0;

  for (const qa of TRAINED_QA) {
    const cleanQ = qa.q.toLowerCase().trim().replace(/[?,.!-]/g, "");
    const qWords = cleanQ.split(/\s+/).filter(w => w.length > 2);
    
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

  // Lower threshold (0.24) is extremely safe because first aid topics are highly unique
  if (highestScore > 0.24 && bestMatch) {
    console.log(`[Trained Match Found] Question "${userInput}" matched layout "${bestMatch.q}" with score ${highestScore.toFixed(3)}`);
    return bestMatch.a;
  }

  return null;
};

const EMERGENCY_DATASET = `
TRAINED ROAD ACCIDENT FIRST AID KNOWLEDGE DATASET:
${TRAINED_QA.map((qa, i) => `Q${i + 1}: ${qa.q}\nA${i + 1}: ${qa.a}`).join("\n\n")}
`;

const KNOWLEDGE_BASE_CONTEXT = `
  ROAD SAFETY PROTOCOLS:
  1. Always prioritize life safety.
  2. In critical accidents, do not move the victim unless there is imminent danger.
  3. Ensure the scene is visible to other traffic using blinkers or flares.
  
  ${EMERGENCY_DATASET}
`;

// Helper for Gemini
const generateAIResponse = async (prompt: string, isHighPriority: boolean = false) => {
  const maxRetries = 3;
  let lastError: any = null;

  // Extract potential keywords from prompt for local fallback
  let localFallbackTip = findTrainedAnswer(prompt) || "Ensure safety, check breathing and pulse, apply firm pressure to wounds to stop bleeding, and wait for emergency services.";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash", // Using stable latest flash for reliability
        contents: prompt,
        config: {
          maxOutputTokens: isHighPriority ? 120 : 300,
          temperature: 0.1,
          systemInstruction: "EMERGENCY PROTOCOL: You are a trained first aid assistant. Match the user question or statement to the provided dataset of questions and answers. Reply with the EXACT answer text from the dataset. DO NOT add any introduction, greeting, conversational filler, or extra advisory remarks. IMPORTANT: Ensure all output is simple conversational plain text with absolutely no Markdown, no asterisks, no bolding,, and no bullet points, so it can be safely synthesized by a Text-to-Speech engine.",
        }
      });
      
      const text = response.text;
      if (text) return text;
      
      throw new Error("Empty response from AI");
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || "";
      const isTransient = errorMsg.includes("503") || 
                        errorMsg.includes("500") || 
                        errorMsg.includes("high demand") || 
                        errorMsg.includes("UNAVAILABLE") ||
                        errorMsg.includes("INTERNAL") ||
                        errorMsg.includes("overloaded") ||
                        errorMsg.includes("Empty response");

      if (isTransient && attempt < maxRetries) {
        // Fast retry for high priority, slower for others
        const baseDelay = isHighPriority ? 800 : 1500;
        const delay = Math.pow(1.5, attempt) * baseDelay + (Math.random() * 300); 
        console.warn(`⚠️ Gemini API Retry (${attempt + 1}/${maxRetries}) in ${Math.round(delay)}ms: ${errorMsg}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      console.error("❌ Gemini API Error:", errorMsg);
      break;
    }
  }
  
  // If all retries fail, return the local tip without the "server busy" message to avoid user frustration
  return localFallbackTip;
};

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { 
  ChatPromptTemplate, 
  SystemMessagePromptTemplate, 
  HumanMessagePromptTemplate, 
  MessagesPlaceholder 
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";

const aiMemory = new InMemoryChatMessageHistory();

let langchainConversation: RunnableWithMessageHistory<any, any> | null = null;
const getLangchainConversation = () => {
  if (!langchainConversation) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
    
    // We use gemini-2.5-flash for speed and conversational capabilities
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      apiKey: apiKey,
      temperature: 0.3,
    });
    
    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(`You are the Road-SOS voice assistant. Answer basic questions clearly and concisely. You are communicating via Voice (TTS), so you MUST NOT use markdown, bullet points, bold text, or asterisks. Keep answers brief and conversational.`),
      new MessagesPlaceholder("history"),
      HumanMessagePromptTemplate.fromTemplate("{input}")
    ]);

    const chain = prompt.pipe(model);

    langchainConversation = new RunnableWithMessageHistory({
      runnable: chain,
      getMessageHistory: () => aiMemory,
      inputMessagesKey: "input",
      historyMessagesKey: "history",
    });
  }
  return langchainConversation;
};

// API: AI Road Assistant
app.post("/api/ai/ask", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "Question is required" });

  try {
    if (question.toLowerCase().trim() === "hello") {
      return res.json({ answer: "Hello! How can I help you?" });
    }

    // 1. Direct local matching with our trained Q&A
    const trainedAns = findTrainedAnswer(question);
    if (trainedAns) {
      console.log(`[Ask API] Intercepted and answered directly using trained Q&As for: "${question}"`);
      return res.json({ answer: trainedAns });
    }

    let chain = getLangchainConversation();
    let response;
    
    try {
       response = await chain.invoke(
         { input: question },
         { configurable: { sessionId: "default" } }
       );
    } catch (e: any) {
       if (e.message?.includes("503") || e.message?.includes("UNAVAILABLE") || e.message?.includes("high demand") || e.message?.includes("429")) {
          console.log("[Ask API] gemini-2.5-flash failed, falling back to gemini-2.0-flash");
          const apiKey = process.env.GEMINI_API_KEY;
          const fallbackModel = new ChatGoogleGenerativeAI({
            model: "gemini-2.0-flash",
            apiKey: apiKey,
            temperature: 0.3,
          });
          const prompt = ChatPromptTemplate.fromMessages([
            SystemMessagePromptTemplate.fromTemplate(`You are the Road-SOS voice assistant. Answer basic questions clearly and concisely. You are communicating via Voice (TTS), so you MUST NOT use markdown, bullet points, bold text, or asterisks. Keep answers brief and conversational.`),
            new MessagesPlaceholder("history"),
            HumanMessagePromptTemplate.fromTemplate("{input}")
          ]);
          const fallbackChain = new RunnableWithMessageHistory({
            runnable: prompt.pipe(fallbackModel),
            getMessageHistory: (sessionId) => aiMemory,
            inputMessagesKey: "input",
            historyMessagesKey: "history",
          });
          response = await fallbackChain.invoke(
             { input: question },
             { configurable: { sessionId: "default" } }
          );
       } else {
          throw e;
       }
    }
    
    // Ensure no markdown sneaks in
    let rawContent = typeof response.content === "string" ? response.content : "Sorry, I encountered an error.";
    let cleanAnswer = rawContent.replace(/([*_~`#])/g, '');
    
    res.json({ answer: cleanAnswer });
  } catch (error: any) {
    console.error("❌ AI Error:", error.message);
    res.status(500).json({ error: "AI Assistant Failure" });
  }
});

// Status Stores
let isDrivingModeActive = false;
let lastConfirmation = { confirmed: false, responder: "", timestamp: 0 };

// API: Get Emergency Confirmation Status
app.get("/api/emergencies/confirmation-status", (req, res) => {
  res.json(lastConfirmation);
});

// API: Confirm Emergency Response manually (from Simulation UI or internal triggers)
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

// API: Reset Confirmation Status (to begin a fresh monitoring sequence)
app.post("/api/emergencies/confirmation-reset", (req, res) => {
  lastConfirmation = { confirmed: false, responder: "", timestamp: 0 };
  res.json({ success: true });
});

// API: Twilio SMS reply webhook
app.post("/api/twilio/sms", (req, res) => {
  const body = (req.body.Body || "").toLowerCase().trim();
  const from = req.body.From || "Emergency Dispatch";
  console.log(`[Twilio Webhook] Received SMS reply: "${body}" from ${from}`);
  
  // Typical acknowledgment words
  const keywords = ["yes", "ok", "confirm", "coming", "on my way", "arrival", "ack", "active", "help", "en route", "dispatched", "will attend", "1"];
  const isConfirmed = keywords.some(kw => body.includes(kw)) || body === "1";
  
  const twiml = new twilio.twiml.MessagingResponse();
  
  if (isConfirmed) {
    lastConfirmation = {
      confirmed: true,
      responder: from,
      timestamp: Date.now()
    };
    (app as any).io.emit("help_arriving", lastConfirmation);
    twiml.message(`RoadSOS: Acknowledged. We are transmitting confirmation to the victim that help is arriving.`);
  } else {
    twiml.message(`RoadSOS Emergency: Response ignored or not understood. Send 'YES', 'OK', or '1' to confirm dispatch.`);
  }
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// API: Twilio Call Gather webhook for keypress "1" confirm
app.post("/api/twilio/call-gather", (req, res) => {
  const digits = req.body.Digits;
  const hostUrl = `${req.protocol}://${req.get('host')}`;
  console.log(`[Twilio Call Gather] Keypress digit received: ${digits}`);
  
  const twiml = new twilio.twiml.VoiceResponse();
  if (digits === "1") {
    lastConfirmation = {
      confirmed: true,
      responder: "Ambulance Driver (+917892375787)",
      timestamp: Date.now()
    };
    // Seamlessly trigger async update
    setTimeout(() => {
      (app as any).io.emit("help_arriving", lastConfirmation);
    }, 0);
    twiml.say("Help is coming");
    twiml.hangup();
  } else {
    twiml.say("Command not recognized");
    twiml.hangup();
  }
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// API: Set Driving Mode Status
app.post("/api/status/driving", (req, res) => {
  const { active } = req.body;
  isDrivingModeActive = !!active;
  console.log(`[Status] Driving Mode: ${isDrivingModeActive ? 'ENABLED' : 'DISABLED'}`);
  res.json({ success: true, isDrivingModeActive });
});

// API: Twilio Voice Webhook
app.post("/api/twilio/voice", (req, res) => {
  console.log(`[Twilio Webhook] Received voice request. Driving Mode Active: ${isDrivingModeActive}`);
  const twiml = new twilio.twiml.VoiceResponse();
  
  if (isDrivingModeActive) {
    twiml.say("The person you are calling is currently driving and has Road SOS protection active. They will be notified of your call when they reach their destination safely.");
    twiml.hangup();
  } else {
    twiml.say("Connecting you to the Road SOS user.");
    // In a real app, you might dial the user's real number
    // For this prototype, we'll just acknowledge the call if not driving
    twiml.say("The user is currently available but Road SOS is in monitoring mode. Please try later or use the distress frequency.");
    twiml.hangup();
  }
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Twilio Configuration
let twilioClient: twilio.Twilio | null = null;
const getTwilio = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("Twilio credentials missing.");
  }
  if (!twilioClient) {
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
};

// API: Log Emergency Dispatch
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
  } catch (error: any) {
    console.error("❌ Supabase Log Error:", error.message);
    res.status(500).json({ error: "Storage Failure" });
  }
});

// API: Voice Processing (Classification & Instructions)
app.post("/api/ai/voice-process", async (req, res) => {
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: "Transcript required" });

  try {
    // 1. Direct local matching with our trained Q&A first
    const trainedAns = findTrainedAnswer(transcript);
    if (trainedAns) {
      console.log(`[Voice Process] Intercepted and answered directly using trained Q&As for: "${transcript}"`);
      return res.json({ mode: 'TRAINING', content: trainedAns, original_transcript: transcript });
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

    let mode = 'GENERAL';
    if (text.includes('[MODE: EMERGENCY]')) mode = 'EMERGENCY';
    else if (text.includes('[MODE: TRAINING]')) mode = 'TRAINING';

    res.json({ mode, content: text.replace(/\[MODE: .*?\]/, "").replace(/Content:/, "").trim(), original_transcript: transcript });
  } catch (error: any) {
    console.error("❌ AI Error:", error);
    res.status(500).json({ error: "AI failure" });
  }
});

// API: Bulk SMS Notify
app.post("/api/sos/notify", async (req, res) => {
  // Reset confirmation state upon new notify
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

    const results = [];
    for (const to of recipients) {
      const formattedTo = to.trim().startsWith('+') ? to.trim() : `+${to.trim()}`;
      console.log(`[SMS] Sending to: ${formattedTo} from: ${from}`);
      try {
        const result = await client.messages.create({
          body: message,
          to: formattedTo,
          from: from
        });
        results.push({ status: "fulfilled", value: result });
        // Add a small delay between messages to ensure proper delivery order
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`[SMS] Failed to send to ${formattedTo}:`, err);
        results.push({ status: "rejected", reason: err });
      }
    }
    
    console.log(`[SMS] Delivered to ${results.filter((r: any) => r.status === 'fulfilled').length} recipients.`);
    res.json({ success: true, results });
  } catch (error: any) {
    console.error("❌ Twilio SMS Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Twilio Distress Call (NEON)
app.post("/api/sos/call-neon", async (req, res) => {
  const { to = "+916361892311", patientName = "BOB" } = req.body;
  if (!to) return res.status(400).json({ error: "Target phone number 'to' is required." });

  console.log(`[Neon Distress] Attempting to call: ${to}`);
  try {
    const client = getTwilio();
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!from) throw new Error("TWILIO_FROM_NUMBER is missing");

    const formattedTo = to.trim().startsWith('+') ? to.trim() : `+${to.trim()}`;
    const hostUrl = `https://${req.get('host')}`;
    const twimlString = `<Response>
      <Gather numDigits="1" action="${hostUrl}/api/twilio/call-neon-gather?patient=${encodeURIComponent(patientName)}" timeout="15" method="POST">
        <Say>Emergency distress alert. Press 1 to acknowledge.</Say>
      </Gather>
      <Say>No confirmation received.</Say>
    </Response>`;
    
    const call = await client.calls.create({
      twiml: twimlString,
      to: formattedTo,
      from: from
    });
    console.log(`[Neon Call] SID: ${call.sid}`);
    res.json({ success: true, callSid: call.sid });
  } catch (error: any) {
    console.error("❌ Neon Call Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/twilio/call-neon-gather", (req, res) => {
  const digits = req.body.Digits;
  const patient = req.query.patient || "BOB";
  console.log(`[Twilio Call Neon Gather] Keypress digit received: ${digits}`);
  const twiml = new twilio.twiml.VoiceResponse();
  if (digits === "1") {
    setTimeout(() => {
      (app as any).io.emit("neon_confirmed", { timestamp: Date.now() });
    }, 0);
    twiml.say({ loop: 3 }, `${patient} is in danger!`);
    twiml.hangup();
  } else {
    twiml.say("Command not recognized.");
    twiml.hangup();
  }
  res.type('text/xml');
  res.send(twiml.toString());
});

// API: Initiate Call (HELP)
app.post("/api/sos/call-initiate", async (req, res) => {
  const { to = "+917892375787", message, host } = req.body;
  console.log(`[Call] Attempting to call: ${to}`);
  try {
    const client = getTwilio();
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!from) throw new Error("TWILIO_FROM_NUMBER is missing");

    const formattedTo = to.trim().startsWith('+') ? to.trim() : `+${to.trim()}`;
    const hostUrl = host || `https://${req.get('host')}`;
    
    const twimlString = `<Response>
      <Gather numDigits="1" action="${hostUrl}/api/twilio/call-gather" timeout="15" method="POST">
        <Say>${message || 'Emergency. Please press 1 to confirm dispatch of help.'}</Say>
      </Gather>
      <Say>We did not receive confirmation.</Say>
    </Response>`;

    const call = await client.calls.create({
      twiml: twimlString,
      to: formattedTo,
      from: from
    });
    res.json({ success: true, callSid: call.sid });
  } catch (error: any) {
    console.error("❌ Twilio Call Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});


// API: Traffic Updates using Google Search Grounding
app.post("/api/traffic-updates", async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: "Missing lat/lng" });

  try {
    const ai = getAI();
    const prompt = `Give me a concise real-time traffic update (under 30 words) on traffic jams, accident reports, or road closures within a 2 to 3 km radius of latitude ${lat}, longitude ${lng}. CRITICAL: Give the actual street names and area names where the traffic is. DO NOT output the latitude and longitude coordinates in your response. Format as plain text.`;

    const generateCall = async (modelName: string) => {
      return await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });
    };

    let response;
    try {
      response = await generateCall("gemini-2.5-flash");
    } catch (e: any) {
      if (e.message?.includes("503") || e.message?.includes("UNAVAILABLE") || e.message?.includes("high demand")) {
         response = await generateCall("gemini-2.0-flash");
      } else {
         throw e;
      }
    }

    res.json({ update: response.text });
  } catch (error: any) {
    console.error("❌ Traffic Update Error:", error.message);
    res.status(500).json({ error: "Failed to fetch traffic updates" });
  }
});

app.post("/api/places/nearby", async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Google Maps API key not configured on server" });
    }
    
    // We expect the client to send the body
    const body = req.body;
    
    // The FieldMask could be sent via headers from client or we hardcode a generous one.
    const fieldMask = req.headers['x-goog-fieldmask'] || "places.displayName,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber";
    
    const placesUrl = `https://places.googleapis.com/v1/places:searchNearby`;
    const response = await fetch(placesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask as string
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.json(data);
  } catch (error: any) {
    console.error("❌ Places API Proxy Error:", error.message);
    res.status(500).json({ error: "Places API Proxy Failure" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
