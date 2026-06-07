import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import twilio from "twilio";
import { createServer } from "http";
import { Server } from "socket.io";
import PDFDocument from "pdfkit";

dotenv.config();

const reportStore = new Map<string, Buffer>();

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
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
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
  { q: "hello", a: "HEILO bob how are you doing!" },
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

  // Threshold (0.45) is safer so we don't accidentally intercept general AI questions
  if (highestScore > 0.45 && bestMatch) {
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
        model: "gemini-2.5-flash-lite", // Using stable latest flash lite for reliability and low latency
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
      if (errorMsg.includes("quota") || errorMsg.includes("Quota")) {
        console.log(`[AI] Quota exceeded. Using safe fallback.`);
        return localFallbackTip;
      }
      const isTransient = errorMsg.includes("503") || 
                        errorMsg.includes("500") || 
                        errorMsg.includes("high demand") || 
                        errorMsg.includes("UNAVAILABLE") ||
                        errorMsg.includes("INTERNAL") ||
                        errorMsg.includes("overloaded") ||
                        errorMsg.includes("429") ||
                        errorMsg.includes("Empty response");

      if (isTransient && attempt < maxRetries) {
        // Fast retry for high priority, slower for others
        const baseDelay = isHighPriority ? 800 : 1500;
        const delay = Math.pow(1.5, attempt) * baseDelay + (Math.random() * 300); 
        console.warn(`⚠️ Gemini API Retry (${attempt + 1}/${maxRetries}) in ${Math.round(delay)}ms: ${errorMsg}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      console.log("⚠️ Gemini API Error:", errorMsg);
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

let currentWeatherData = "Weather data unavailable.";
async function updateWeather() {
  try {
     const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=12.9716&longitude=77.5946&current=temperature_2m,relative_humidity_2m,precipitation&timezone=Asia%2FKolkata");
     const data = await res.json();
     if (data && data.current) {
        currentWeatherData = `Current temperature is ${data.current.temperature_2m}°C, humidity is ${data.current.relative_humidity_2m}%, precipitation is ${data.current.precipitation}mm.`;
     }
  } catch(e) {}
}
updateWeather();
setInterval(updateWeather, 10 * 60 * 1000); // 10 minutes

let langchainConversation: RunnableWithMessageHistory<any, any> | null = null;
const getLangchainConversation = () => {
  if (!langchainConversation) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
    
    // We use gemini-2.5-flash-lite for speed and conversational capabilities
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash-lite",
      apiKey: apiKey,
      temperature: 0.3,
      maxRetries: 3,
    });
    
    const systemPrompt = `You are an elite, highly responsive voice assistant integrated into a smart application. 

Your specialized domains of expertise are climate, traffic conditions, vehicle specifications, rules, regulations, and general knowledge. 

IMPORTANT SYSTEM CONTEXT:
- The current time in India (IST) is: {current_time}
- Current Weather Information: {weather_info}
- User Location context: {location_context}
- Nearest Hospital context: {nearest_hospital_context}
Use this context to accurately answer questions about the current time, weather, current location, or navigating to the nearest hospital. If the user asks for their current location, tell them their latitude and longitude based on the context. If they ask for route navigation or the nearest hospital, explicitly use the Nearest Hospital context (which integrates with existing Places API functions) to tell them the hospital name and that route navigation is available.

Because your output is fed directly into a Text-to-Speech engine, you MUST strictly adhere to the following voice-first rules:

1. RADICAL CONCISENESS: Limit your answers to 1 to 3 short sentences. Be direct and punchy. Only elaborate if the user explicitly asks for details.
2. ZERO MARKDOWN: Never use bolding, asterisks, bullet points, lists, code blocks, or emojis. Write in completely plain, flat text.
3. SPOKEN FORMATTING: Spell out all numbers, symbols, and acronyms exactly as they should be spoken aloud (e.g., write "one hundred kilometers per hour" instead of "100 km/h", and "U. S. A." instead of "USA").
4. CONVERSATIONAL TONE: Be helpful, natural, and friendly. Do not use robotic or overly formal language.
5. GENERAL KNOWLEDGE: You are equipped to answer any general knowledge questions the user throws at you. Answer them accurately and concisely.
6. HONESTY: Only state you don't know if you genuinely lack the information. Otherwise, strive to provide a helpful answer.`;

    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(systemPrompt),
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
  const { question, stream, location } = req.body;
  if (!question) return res.status(400).json({ error: "Question is required" });
  
  let location_context = "Location not provided by user.";
  let nearest_hospital_context = "Cannot determine nearest hospital without user location.";
  
  if (location) {
     location_context = `Latitude: ${location.lat}, Longitude: ${location.lng}`;
     if (question.toLowerCase().includes("hospital") || question.toLowerCase().includes("clinic") || question.toLowerCase().includes("navigate") || question.toLowerCase().includes("nearest")) {
       try {
         const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY;
         if (apiKey) {
            const placesUrl = `https://places.googleapis.com/v1/places:searchNearby`;
            const hRes = await fetch(placesUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "places.displayName"
              },
              body: JSON.stringify({
                includedTypes: ["hospital"],
                maxResultCount: 1,
                locationRestriction: {
                  circle: {
                    center: { latitude: location.lat, longitude: location.lng },
                    radius: 5000.0
                  }
                }
              })
            });
            const hData = await hRes.json();
            if (hData && hData.places && hData.places.length > 0) {
               nearest_hospital_context = `The nearest hospital found via Places API is: ${hData.places[0].displayName?.text || 'Unknown Hospital'}.`;
            } else {
               nearest_hospital_context = "No hospital found within a 5km radius.";
            }
         }
       } catch (e) {
          console.error("Error fetching nearest hospital context:", e);
       }
     }
  }

  try {
    if (question.toLowerCase().trim().includes("hello")) {
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ chunk: "HEILO bob how are you doing!" })}\n\n`);
        return res.end();
      }
      return res.json({ answer: "HEILO bob how are you doing!" });
    }

    // 1. Direct local matching with our trained Q&A
    const trainedAns = findTrainedAnswer(question);
    if (trainedAns) {
      console.log(`[Ask API] Intercepted and answered directly using trained Q&As for: "${question}"`);
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ chunk: trainedAns })}\n\n`);
        return res.end();
      }
      return res.json({ answer: trainedAns });
    }

    let chain = getLangchainConversation();
    
    if (stream) {
       res.setHeader('Content-Type', 'text/event-stream');
       res.setHeader('Cache-Control', 'no-cache');
       res.setHeader('Connection', 'keep-alive');

       try {
          const streamResponse = await chain.stream(
            { 
              input: question,
              current_time: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", timeStyle: "long", dateStyle: "full" }),
              weather_info: currentWeatherData,
              location_context,
              nearest_hospital_context
            },
            { configurable: { sessionId: "default" } }
          );
          for await (const chunk of streamResponse) {
             if (chunk?.content) {
               res.write(`data: ${JSON.stringify({ chunk: chunk.content })}\n\n`);
             }
          }
          return res.end();
       } catch (e: any) {
          console.error("[Ask API] Streaming error:", e.message);
          res.write(`data: ${JSON.stringify({ chunk: " I'm experiencing connectivity issues right now. Ensure standard safety protocols." })}\n\n`);
          return res.end();
       }
    }

    let response;
    try {
       response = await chain.invoke(
         { 
           input: question,
           current_time: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", timeStyle: "long", dateStyle: "full" }),
           weather_info: currentWeatherData,
           location_context,
           nearest_hospital_context
         },
         { configurable: { sessionId: "default" } }
       );
    } catch (e: any) {
       const isQuota = e.message?.includes("exceeded your current quota") || e.message?.includes("Quota");
       
       if (isQuota) {
          console.log("[Ask API] Quota exceeded. Using safe local fallback.");
          response = { content: "I'm experiencing connectivity issues right now. Ensure standard safety protocols, apply firm pressure to any bleeding wounds, and wait for emergency services." };
       } else if (e.message?.includes("503") || e.message?.includes("UNAVAILABLE") || e.message?.includes("high demand") || e.message?.includes("429")) {
          console.log("[Ask API] gemini-2.5-flash-lite failed, falling back.");
          const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
          const fallbackModel = new ChatGoogleGenerativeAI({
            model: "gemini-1.5-flash-8b",
            apiKey: apiKey,
            temperature: 0.3,
            maxRetries: 0,
          });
          const systemPrompt = `You are an elite, highly responsive voice assistant integrated into a smart application. 

Your specialized domains of expertise are climate, traffic conditions, vehicle specifications, rules, regulations, and general knowledge. 

IMPORTANT SYSTEM CONTEXT:
- The current time in India (IST) is: {current_time}
- Current Weather Information: {weather_info}
- User Location context: {location_context}
- Nearest Hospital context: {nearest_hospital_context}
Use this context to accurately answer questions about the current time, weather, current location, or navigating to the nearest hospital. If the user asks for their current location, tell them their latitude and longitude based on the context. If they ask for route navigation or the nearest hospital, explicitly use the Nearest Hospital context (which integrates with existing Places API functions) to tell them the hospital name and that route navigation is available.

Because your output is fed directly into a Text-to-Speech engine, you MUST strictly adhere to the following voice-first rules:

1. RADICAL CONCISENESS: Limit your answers to 1 to 3 short sentences. Be direct and punchy. Only elaborate if the user explicitly asks for details.
2. ZERO MARKDOWN: Never use bolding, asterisks, bullet points, lists, code blocks, or emojis. Write in completely plain, flat text.
3. SPOKEN FORMATTING: Spell out all numbers, symbols, and acronyms exactly as they should be spoken aloud (e.g., write "one hundred kilometers per hour" instead of "100 km/h", and "U. S. A." instead of "USA").
4. CONVERSATIONAL TONE: Be helpful, natural, and friendly. Do not use robotic or overly formal language.
5. GENERAL KNOWLEDGE: You are equipped to answer any general knowledge questions the user throws at you. Answer them accurately and concisely.
6. HONESTY: Only state you don't know if you genuinely lack the information. Otherwise, strive to provide a helpful answer.`;

          const prompt = ChatPromptTemplate.fromMessages([
            SystemMessagePromptTemplate.fromTemplate(systemPrompt),
            new MessagesPlaceholder("history"),
            HumanMessagePromptTemplate.fromTemplate("{input}")
          ]);
          const fallbackChain = new RunnableWithMessageHistory({
            runnable: prompt.pipe(fallbackModel),
            getMessageHistory: (sessionId) => aiMemory,
            inputMessagesKey: "input",
            historyMessagesKey: "history",
          });
          try {
             response = await fallbackChain.invoke(
                { 
                  input: question,
                  current_time: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", timeStyle: "long", dateStyle: "full" }),
                  weather_info: currentWeatherData,
                  location_context,
                  nearest_hospital_context
                },
                { configurable: { sessionId: "default" } }
             );
          } catch (fallbackError: any) {
             console.log("[Ask API] Fallback also failed, using safe local fallback.");
             response = { content: "I'm experiencing connectivity issues right now. Ensure standard safety protocols." };
          }
       } else {
          console.log("[Ask API] Unexpected error:", e.message, "Falling back.");
          response = { content: "I'm having trouble connecting to my central systems, please ensure standard safety protocols." };
       }
    }
    
    // Ensure no markdown sneaks in
    let rawContent = typeof response.content === "string" ? response.content : "Sorry, I encountered an error.";
    let cleanAnswer = rawContent.replace(/([*_~`#])/g, '');
    
    res.json({ answer: cleanAnswer });
  } catch (error: any) {
    if (error.message?.includes("quota") || error.message?.includes("429")) {
        console.log("⚠️ AI Error: Quota/Rate Limit Exceeded.");
    } else {
        console.log("⚠️ AI Error:", error.message);
    }
    res.json({ answer: "I'm experiencing connectivity issues right now. How else can I assist you with safety?", error_detail: "Connection Issue" });
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
  try {
    const digits = req.body.Digits;
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    console.log(`[Twilio Call Gather] Keypress digit received: ${digits}`);
    
    const twiml = new twilio.twiml.VoiceResponse();
    if (digits === "1") {
      twiml.say("Help is coming");
      twiml.hangup();
      
      // Seamlessly trigger async update
      setTimeout(() => {
        lastConfirmation = {
          confirmed: true,
          responder: "Ambulance Driver (+917892375787)",
          timestamp: Date.now()
        };
        (app as any).io.emit("help_arriving", lastConfirmation);
      }, 0);
    } else {
      twiml.say("Command not recognized");
      twiml.hangup();
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error: any) {
    console.error(`[Twilio webhook error]: ${error.message}`);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("An application error occurred.");
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
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

app.post("/api/sos/send-report", async (req, res) => {
  const { responder, logs, medicalInfo } = req.body;
  if (!responder) return res.status(400).json({ error: "Missing responder" });

  try {
    const doc = new PDFDocument();
    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));
    
    // Generate PDF content
    doc.fontSize(20).text("RoadSOS Accident Report", { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Patient Name: ${medicalInfo?.name || 'Unknown'}`);
    doc.text(`Blood Group: ${medicalInfo?.bloodGroup || 'Unknown'}`);
    doc.text(`Medical Conditions: ${medicalInfo?.conditions || 'None'}`);
    doc.moveDown();
    doc.fontSize(16).text("Recent Accident Logs:");
    doc.fontSize(12);
    (logs || []).forEach((log: any) => {
      doc.text(`[${new Date(log.timestamp).toLocaleString()}] ${log.message}`);
    });
    
    doc.end();

    doc.on('end', async () => {
      const pdfData = Buffer.concat(buffers);
      const reportId = Date.now().toString() + "-" + Math.floor(Math.random()*1000);
      reportStore.set(reportId, pdfData);

      try {
        const client = getTwilio();
        const from = process.env.TWILIO_FROM_NUMBER;
        const hostUrl = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
        const reportUrl = `${hostUrl}/api/report/${reportId}.pdf`;

        await client.messages.create({
          body: `RoadSOS: Victim's Medical & Accident Logs PDF Report available here: ${reportUrl}`,
          from,
          to: responder
        });
        res.json({ success: true, reportId, reportUrl });
      } catch (err: any) {
        if (err.message && err.message.includes("Authenticate")) {
           console.error("Twilio report send error: Twilio Authentication Failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Settings.");
        } else {
           console.error("Twilio report send error:", err);
        }
        res.status(500).json({ error: err.message });
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/report/:id.pdf", (req, res) => {
  const data = reportStore.get(req.params.id);
  if (!data) return res.status(404).send("Report not found or expired");
  res.contentType("application/pdf");
  res.send(data);
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

// API: Twilio Diagnostics
app.get("/api/diagnostics/twilio", (req, res) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNum = process.env.TWILIO_FROM_NUMBER;
  
  const hostUrl = `${req.protocol}://${req.get('host')}`;
  
  const status = {
    environment_variables: {
      TWILIO_ACCOUNT_SID: {
        configured: !!sid,
        valid_format: !!sid && (sid.startsWith("AC") || sid.length > 20)
      },
      TWILIO_AUTH_TOKEN: {
        configured: !!token,
        valid_format: !!token && token.length > 20
      },
      TWILIO_FROM_NUMBER: {
        configured: !!fromNum,
        valid_format: !!fromNum && fromNum.startsWith("+")
      }
    },
    webhook_configuration_urls: {
      sms_webhook: `${hostUrl}/api/twilio/sms`,
      voice_webhook: `${hostUrl}/api/twilio/voice`,
      instructions: "Set the above URLs in your Twilio Console for the configured phone number under 'Messaging' (Webhook) and 'Voice' (Webhook) sections."
    },
    overall_status: !!(sid && token && fromNum) ? "READY" : "MISSING_CONFIGURATION"
  };
  
  res.json(status);
});

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
    console.log("⚠️ Supabase Log Error:", error.message);
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
    if (error?.message?.includes("quota") || error?.message?.includes("429")) {
        console.log("⚠️ AI Error: Quota.");
    } else {
        console.log("⚠️ AI Error.");
    }
    res.json({ mode: 'GENERAL', content: "Ensure safety, check breathing and pulse, apply firm pressure to wounds to stop bleeding, and wait for emergency services.", original_transcript: transcript });
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
      } catch (err: any) {
        if (err.message && err.message.includes("Authenticate")) {
           console.error(`[SMS] Failed to send to ${formattedTo}: Twilio Authentication Error. Please check your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in the AI Studio Settings menu.`);
        } else {
           console.error(`[SMS] Failed to send to ${formattedTo}:`, err);
        }
        results.push({ status: "rejected", reason: err });
      }
    }
    
    console.log(`[SMS] Delivered to ${results.filter((r: any) => r.status === 'fulfilled').length} recipients.`);
    res.json({ success: true, results });
  } catch (error: any) {
    console.log("⚠️ Twilio SMS Error:", error.message);
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
        <Say>${patientName} is in danger. ${patientName} is in danger. Press 1 to acknowledge.</Say>
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
    if (error.message && error.message.includes("Authenticate")) {
       console.log("⚠️ Neon Call Error: Twilio Authentication Failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Settings.");
    } else {
       console.log("⚠️ Neon Call Error:", error.message);
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/twilio/call-neon-gather", (req, res) => {
  try {
    const digits = req.body.Digits;
    const patient = req.query.patient || "BOB";
    console.log(`[Twilio Call Neon Gather] Keypress digit received: ${digits}`);
    const twiml = new twilio.twiml.VoiceResponse();
    if (digits === "1") {
      twiml.say({ loop: 3 }, `${patient} is in danger!`);
      twiml.hangup();
      
      setTimeout(() => {
        (app as any).io.emit("neon_confirmed", { timestamp: Date.now() });
      }, 0);
    } else {
      twiml.say("Command not recognized.");
      twiml.hangup();
    }
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error: any) {
    console.error(`[Twilio neon call webhook error]: ${error.message}`);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("An application error occurred.");
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
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
    if (error.message && error.message.includes("Authenticate")) {
       console.log("⚠️ Twilio Call Error: Twilio Authentication Failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Settings.");
    } else {
       console.log("⚠️ Twilio Call Error:", error.message);
    }
    res.status(500).json({ success: false, error: error.message });
  }
});


let voiceAgentMutex: Promise<any> = Promise.resolve();

app.post("/api/ai/voice-agent", async (req, res) => {
  const { transcript, location, history } = req.body;
  const cleanTranscript = (transcript || "").trim();
  
  if (!cleanTranscript || cleanTranscript.length === 0) {
     return res.json({ text: "I'm listening." });
  }

  const executeVoiceAgent = async () => {
    try {
      // Setup Native Gemini Function Calling
      const ai = getAI();
      
      // Define the tools strictly based on user intent
      const execute_sos_dispatch = {
      name: "execute_sos_dispatch",
      description: "ONLY trigger the SOS emergency dispatch if the user EXPLICITLY states they are in a life-threatening emergency, have had a severe accident, or explicitly ask for an ambulance. DO NOT use this for general questions, inquiries, or casual chat.",
      parameters: {
        type: Type.OBJECT,
        properties: { type: { type: Type.STRING, description: "The type of emergency, e.g. medical, crash, danger" } },
        required: ["type"]
      }
    };

    const Maps_to_nearest_hospital = {
      name: "Maps_to_nearest_hospital",
      description: "Triggers the Google Places API and routing to navigate to the nearest hospital on the map.",
      parameters: {
        type: Type.OBJECT,
        properties: {},
        required: []
      }
    };

    const toggle_traffic_layer = {
      name: "toggle_traffic_layer",
      description: "Turns the Google Maps traffic layer on or off.",
      parameters: {
        type: Type.OBJECT,
        properties: { state: { type: Type.BOOLEAN, description: "True to turn traffic on, false to turn it off." } },
        required: ["state"]
      }
    };

    const voiceAgentInstruction = `You are an elite, highly responsive voice assistant integrated into a smart application. 

Your specialized domains of expertise are climate, traffic conditions, current time, vehicle specifications, rules, regulations, and general knowledge.

Because your output is fed directly into a Text-to-Speech engine, you MUST strictly adhere to the following voice-first rules:

1. RADICAL CONCISENESS: Limit your answers to 1 to 3 short sentences. Be direct and punchy. Only elaborate if the user explicitly asks for details.
2. ZERO MARKDOWN: Never use bolding, asterisks, bullet points, lists, code blocks, or emojis. Write in completely plain, flat text.
3. SPOKEN FORMATTING: Spell out all numbers, symbols, and acronyms exactly as they should be spoken aloud (e.g., write "one hundred kilometers per hour" instead of "100 km/h", and "U. S. A." instead of "USA").
4. CONVERSATIONAL TONE: Be helpful, natural, and friendly. Do not use robotic or overly formal language.
5. GENERAL KNOWLEDGE: You are equipped to answer any general knowledge questions the user throws at you. Ensure you use search tools for real-time information if needed.
6. TRAFFIC & ROUTES: When the user asks about going to a specific destination, you MUST check for accidents and traffic updates from their current location to the requested destination and give them a spoken summary.
7. HONESTY: Only state you don't know if you genuinely lack the information.

If the user asks a general question, just answer it directly. Only use tools when explicitly requested or necessary.`;

    const historyStr = history && Array.isArray(history) && history.length > 0 
       ? "Conversation History:\n" + history.map((msg: any) => `${msg.role.toUpperCase()}: ${msg.text}`).join('\n') + "\n\n"
       : "";

    const userPrompt = `${historyStr}${req.body.trafficContext ? '\n' + req.body.trafficContext + '\n\n' : ''}User request: "${cleanTranscript}". Current location coords: ${location ? JSON.stringify(location) : 'Unknown'}. Please answer the user's request. If it is a direct command that requires a tool, trigger the appropriate tool. Otherwise, provide a conversational and concise response.`;

    const generateVoiceResponse = async () => {
      let lastError: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: userPrompt,
            config: {
              systemInstruction: voiceAgentInstruction,
              tools: [
                {
                  functionDeclarations: [
                    execute_sos_dispatch,
                    Maps_to_nearest_hospital,
                    toggle_traffic_layer
                  ]
                }
              ]
            }
          });
        } catch (e: any) {
          lastError = e;
          if (e.message?.includes("429") || e.message?.includes("503")) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            continue;
          }
          throw e; // throw immediately on non-transient errors
        }
      }
      throw lastError; // throw after 3 retries
    };

    const response = await generateVoiceResponse();

    const calls = response.functionCalls;
    if (calls && calls.length > 0) {
      return res.json({ toolCall: { name: calls[0].name, args: calls[0].args }, text: "Executing command." });
    }

    // Connect using LangChain to answer the user's question (Weather, Time, General Knowledge)
    const chain = getLangchainConversation();
    const lcResponse = await chain.invoke(
      {
        input: cleanTranscript,
        current_time: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", timeStyle: "long", dateStyle: "full" }),
        weather_info: currentWeatherData,
        location_context: location ? JSON.stringify(location) : "Unknown",
        nearest_hospital_context: "Not provided in this context"
      },
      { configurable: { sessionId: "voice-agent" } }
    );

    return res.json({ text: lcResponse.content });
  } catch (error: any) {
    if (error.message?.includes("quota") || error.message?.includes("Quota") || error.message?.includes("429") || error.message?.includes("503") || error.message?.includes("UNAVAILABLE")) {
      console.log("⚠️ Voice Agent is at full capacity (Quota/Rate Limit). Using local Q&A fallback.");
      const fallbackAns = findTrainedAnswer(transcript);
      if (fallbackAns) {
         return res.json({ text: fallbackAns });
      }
      return res.json({ text: "I'm experiencing high network traffic, but I'm here. How can I help you stay safe?" });
    }
    console.log("⚠️ Voice Agent Auth/Request Issue.", error.message);
    // Fallback instead of sending status 500 to prevent opaque API_FAIL
    return res.json({ text: "I experienced a temporary disconnect from my systems, but I am still listening." });
  }
  };

  const nextMutex = voiceAgentMutex.then(() => executeVoiceAgent()).catch(() => executeVoiceAgent());
  voiceAgentMutex = nextMutex;
});

// Cache for traffic updates to avoid slow AI/quota limits
const trafficCache = new Map<string, { result: string, timestamp: number }>();

// API: Traffic Updates using Google Search Grounding
app.post("/api/traffic-updates", async (req, res) => {
  const { lat, lng, locationName } = req.body;
  if (!locationName && (!lat || !lng)) return res.status(400).json({ error: "Missing location" });

  const cacheKey = locationName ? locationName.toLowerCase() : `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = trafficCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return res.json({ update: cached.result });
  }

  try {
    const ai = getAI();
    let prompt = "";
    if (locationName) {
        prompt = `Give me a concise real-time traffic update (under 30 words) on traffic jams, accident reports, or road closures within a 2-3 km radius of ${locationName}. CRITICAL: Give the actual street names and area names where the traffic is. Format as plain text.`;
    } else {
        prompt = `Give me a concise real-time traffic update (under 30 words) on traffic jams, accident reports, or road closures within a 2 to 3 km radius of latitude ${lat}, longitude ${lng}. CRITICAL: Give the actual street names and area names where the traffic is. DO NOT output the latitude and longitude coordinates in your response. Format as plain text.`;
    }

    const generateCall = async (modelName: string, retries = 2): Promise<any> => {
      for (let i = 0; i < retries; i++) {
        try {
          return await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
            }
          });
        } catch (e: any) {
          const isQuota = e.message?.includes("exceeded your current quota") || e.message?.includes("Quota exceeded");
          if (isQuota) {
            console.log(`[Ask API] Quota exceeded for model ${modelName}, failing fast.`);
            throw new Error("QUOTA_EXCEEDED");
          }
          if ((e.message?.includes("503") || e.message?.includes("UNAVAILABLE") || e.message?.includes("high demand") || e.message?.includes("429")) && i < retries - 1) {
            console.log(`Traffic Update retry ${i + 1} due to rate limiting`);
            await new Promise(res => setTimeout(res, 1000)); // fast backoff for UX
            continue;
          }
          throw e;
        }
      }
    };

    let response;
    try {
      response = await generateCall("gemini-2.5-flash-lite"); // Lite is faster for simple search grounding
    } catch (e: any) {
      if (e.message !== "QUOTA_EXCEEDED") {
        console.log("⚠️ Traffic Update fallback hit:", e.message);
      }
      // Fail fast without making user wait long
      const text = "Traffic is currently moderate with standard delays. Always drive safely.";
      trafficCache.set(cacheKey, { result: text, timestamp: Date.now() });
      return res.json({ update: text });
    }

    const text = response.text;
    trafficCache.set(cacheKey, { result: text, timestamp: Date.now() });
    res.json({ update: text });
  } catch (error: any) {
    if (error.message?.includes("quota") || error.message?.includes("429")) {
        console.log("⚠️ Traffic Update Rate Limit hit.");
    } else {
        console.log("⚠️ Traffic Update Error.");
    }
    res.json({ update: "Traffic is currently moderate with standard delays. Always drive safely." });
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
    console.log("⚠️ Places API Proxy Error:", error.message);
    res.status(500).json({ error: "Places API Proxy Failure" });
  }
});

app.post("/api/places/search", async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Google Maps API key not configured on server" });
    }
    
    const body = req.body;
    const fieldMask = req.headers['x-goog-fieldmask'] || "places.displayName,places.location,places.formattedAddress";
    
    const placesUrl = `https://places.googleapis.com/v1/places:searchText`;
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
    console.log("⚠️ Places API Proxy Error:", error.message);
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

if (process.env.VERCEL) {
  // Export app for Vercel Serverless
} else {
  startServer();
}

export default app;
