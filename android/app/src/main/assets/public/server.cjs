"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api/index.ts
var api_exports = {};
__export(api_exports, {
  default: () => api_default
});
module.exports = __toCommonJS(api_exports);
var import_express2 = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_supabase_js2 = require("@supabase/supabase-js");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_twilio = __toESM(require("twilio"), 1);
var import_http = require("http");
var import_socket = require("socket.io");
var import_pdfkit = __toESM(require("pdfkit"), 1);
var import_cookie_parser = __toESM(require("cookie-parser"), 1);
var import_zod2 = require("zod");
var import_xss2 = __toESM(require("xss"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);
var import_express_rate_limit2 = __toESM(require("express-rate-limit"), 1);

// api/auth.ts
var import_express = __toESM(require("express"), 1);
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var import_jsonwebtoken = __toESM(require("jsonwebtoken"), 1);
var import_express_rate_limit = __toESM(require("express-rate-limit"), 1);
var import_supabase_js = require("@supabase/supabase-js");
var import_zod = require("zod");
var import_xss = __toESM(require("xss"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var router = import_express.default.Router();
var SUPABASE_URL = process.env.SUPABASE_URL || "";
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
var supabase = (0, import_supabase_js.createClient)(SUPABASE_URL, SUPABASE_SERVICE_KEY);
var JWT_SECRET = process.env.JWT_SECRET || "fallback-secure-secret-do-not-use-in-production";
var JWT_EXPIRES_IN = "1h";
var emailPasswordSchema = import_zod.z.object({
  email: import_zod.z.string().email(),
  password: import_zod.z.string().min(8)
});
var tokenSchema = import_zod.z.object({
  token: import_zod.z.string().min(10)
});
var resetPasswordSchema = import_zod.z.object({
  token: import_zod.z.string().min(10),
  newPassword: import_zod.z.string().min(8)
});
var loginLimiter = (0, import_express_rate_limit.default)({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: 5,
  // Limit each IP to 5 login requests per `window`
  handler: (req, res) => {
    console.warn(`[Security Alert] Unusual traffic pattern: Too many login attempts from IP ${req.ip}`);
    res.status(429).json({ error: "Too many login attempts from this IP, please try again after 15 minutes" });
  },
  standardHeaders: true,
  legacyHeaders: false
});
var registerLimiter = (0, import_express_rate_limit.default)({
  windowMs: 60 * 60 * 1e3,
  // 1 hour
  max: 3,
  // Limit each IP to 3 account creations per `window`
  handler: (req, res) => {
    console.warn(`[Security Alert] Unusual traffic pattern: Too many account creations from IP ${req.ip}`);
    res.status(429).json({ error: "Too many account creations from this IP, please try again after 1 hour" });
  },
  standardHeaders: true,
  legacyHeaders: false
});
var resetLimiter = (0, import_express_rate_limit.default)({
  windowMs: 60 * 60 * 1e3,
  max: 5,
  handler: (req, res) => {
    console.warn(`[Security Alert] Too many password reset requests from IP ${req.ip}`);
    res.status(429).json({ error: "Too many password reset requests from this IP, please try again after 1 hour" });
  },
  standardHeaders: true,
  legacyHeaders: false
});
var authenticateToken = (req, res, next) => {
  const token = req.cookies?.token || req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Access denied: No token provided" });
  import_jsonwebtoken.default.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Access denied: Invalid or expired session" });
    req.user = user;
    next();
  });
};
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { email, password } = emailPasswordSchema.parse(req.body);
    const safeEmail2 = (0, import_xss.default)(email);
    const salt = await import_bcryptjs.default.genSalt(12);
    const passwordHash = await import_bcryptjs.default.hash(password, salt);
    const verificationToken = import_crypto.default.randomBytes(32).toString("hex");
    const { data: existingUser } = await supabase.from("app_users").select("id").eq("email", email).single();
    if (existingUser) return res.status(409).json({ error: "Email already in use" });
    const { error } = await supabase.from("app_users").insert([{
      email,
      password_hash: passwordHash,
      is_verified: false,
      verification_token: verificationToken
    }]);
    if (error) {
      if (error.code === "42P01") {
        return res.status(201).json({ message: "User registered (mocked, app_users table missing) Please verify email.", mock: true });
      }
      throw error;
    }
    console.log(`[Email Service] Verification link: http://localhost:3000/api/auth/verify?token=${verificationToken}`);
    res.status(201).json({ message: "User registered successfully. Please verify your email." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/verify", async (req, res) => {
  try {
    const { token } = tokenSchema.parse({ token: req.query.token });
    const safeToken = (0, import_xss.default)(token);
    const { data: user, error } = await supabase.from("app_users").select("id, is_verified").eq("verification_token", safeToken).single();
    if (error || !user) return res.status(400).json({ error: "Invalid or expired verification token" });
    await supabase.from("app_users").update({ is_verified: true, verification_token: null }).eq("id", user.id);
    res.send("Email successfully verified. You can now log in.");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = emailPasswordSchema.parse(req.body);
    const safeEmail2 = (0, import_xss.default)(email);
    console.log(`[Auth attempt] Login attempt for ${safeEmail2} from IP: ${req.ip} or ${req.headers["x-forwarded-for"]}`);
    const { data: user, error } = await supabase.from("app_users").select("id, password_hash, is_verified").eq("email", safeEmail2).single();
    if (error || !user) {
      console.warn(`[Auth failure] Invalid email for ${safeEmail2} from IP: ${req.ip}`);
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (!user.is_verified) {
    }
    const validPassword = await import_bcryptjs.default.compare(password, user.password_hash);
    if (!validPassword) {
      console.warn(`[Auth failure] Invalid password for ${email} from IP: ${req.ip}`);
      return res.status(401).json({ error: "Invalid email or password" });
    }
    console.log(`[Auth success] User ${email} logged in from IP: ${req.ip}`);
    const token = import_jsonwebtoken.default.sign({ id: user.id, email: safeEmail2 }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 36e5,
      // 1h
      sameSite: "strict"
    });
    res.json({ message: "Login successful" });
  } catch (error) {
    if (error.code === "42P01") {
      const token = import_jsonwebtoken.default.sign({ id: "mock-id", email: safeEmail }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 36e5, sameSite: "strict" });
      return res.json({ message: "Login successful (mock)" });
    }
    res.status(500).json({ error: error.message });
  }
});
router.post("/forgot-password", resetLimiter, async (req, res) => {
  try {
    const schema = import_zod.z.object({ email: import_zod.z.string().email() });
    const { email } = schema.parse(req.body);
    const safeEmail2 = (0, import_xss.default)(email);
    const resetToken = import_crypto.default.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 36e5).toISOString();
    const { data: user, error } = await supabase.from("app_users").select("id").eq("email", safeEmail2).single();
    if (!error && user) {
      await supabase.from("app_users").update({ reset_token: resetToken, reset_token_expires: resetTokenExpires }).eq("id", user.id);
      console.log(`[Email Service] Password Reset link: http://localhost:3000/api/auth/reset-password?token=${resetToken}`);
    }
    res.json({ message: "If that email is registered, a password reset link has been sent." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.post("/reset-password", resetLimiter, async (req, res) => {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const safeToken = (0, import_xss.default)(token);
    const { data: user, error } = await supabase.from("app_users").select("id, reset_token_expires").eq("reset_token", safeToken).single();
    if (error || !user) return res.status(400).json({ error: "Invalid or expired reset token" });
    if (new Date(user.reset_token_expires) < /* @__PURE__ */ new Date()) {
      return res.status(400).json({ error: "Reset token has expired" });
    }
    const salt = await import_bcryptjs.default.genSalt(12);
    const newPasswordHash = await import_bcryptjs.default.hash(newPassword, salt);
    await supabase.from("app_users").update({
      password_hash: newPasswordHash,
      reset_token: null,
      reset_token_expires: null
    }).eq("id", user.id);
    res.json({ message: "Password has been successfully reset. You can now log in." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/me", authenticateToken, (req, res) => {
  res.json({ user: req.user });
});
var auth_default = router;

// api/index.ts
var import_google_genai = require("@langchain/google-genai");
var import_prompts = require("@langchain/core/prompts");
var import_runnables = require("@langchain/core/runnables");
var import_chat_history = require("@langchain/core/chat_history");
import_dotenv.default.config();
var reportStore = /* @__PURE__ */ new Map();
var app = (0, import_express2.default)();
var httpServer = (0, import_http.createServer)(app);
var io = new import_socket.Server(httpServer, {
  cors: { origin: "*" }
});
var PORT = 3e3;
app.use(import_express2.default.json());
app.use(import_express2.default.urlencoded({ extended: true }));
app.use((0, import_cookie_parser.default)());
app.set("trust proxy", 1);
var apiLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 15 * 60 * 1e3,
  // 15 min
  max: 300,
  handler: (req, res) => {
    console.warn(`[Security Alert] Unusual global traffic pattern detected from IP: ${req.ip}`);
    res.status(429).json({ error: "Too many requests from this IP, please try again later." });
  }
});
var aiLimiter = (0, import_express_rate_limit2.default)({
  windowMs: 60 * 60 * 1e3,
  // 1 Hour
  max: 50,
  handler: (req, res) => {
    console.warn(`[Security Alert] Too many AI Generation requests from IP: ${req.ip}`);
    res.status(429).json({ error: "Too many AI generation requests, please try again later." });
  }
});
app.io = io;
app.use("/api/auth", auth_default);
io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});
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
  { q: "hello", a: "HEILO bob how are you doing!" },
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
  if (highestScore > 0.45 && bestMatch) {
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
        model: "gemini-2.5-flash-lite",
        // Using stable latest flash lite for reliability and low latency
        contents: prompt,
        config: {
          maxOutputTokens: isHighPriority ? 120 : 300,
          temperature: 0.1,
          systemInstruction: "EMERGENCY PROTOCOL: You are a trained first aid assistant. Match the user question or statement to the provided dataset of questions and answers. Reply with the EXACT answer text from the dataset. DO NOT add any introduction, greeting, conversational filler, or extra advisory remarks. IMPORTANT: Ensure all output is simple conversational plain text with absolutely no Markdown, no asterisks, no bolding,, and no bullet points, so it can be safely synthesized by a Text-to-Speech engine."
        }
      });
      const text2 = response.text;
      if (text2) return text2;
      throw new Error("Empty response from AI");
    } catch (error) {
      lastError = error;
      const errorMsg = error.message || "";
      if (errorMsg.includes("quota") || errorMsg.includes("Quota")) {
        console.log(`[AI] Quota exceeded. Using safe fallback.`);
        return localFallbackTip;
      }
      const isTransient = errorMsg.includes("503") || errorMsg.includes("500") || errorMsg.includes("high demand") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("INTERNAL") || errorMsg.includes("overloaded") || errorMsg.includes("429") || errorMsg.includes("Empty response");
      if (isTransient && attempt < maxRetries) {
        const baseDelay = isHighPriority ? 800 : 1500;
        const delay = Math.pow(1.5, attempt) * baseDelay + Math.random() * 300;
        console.warn(`\u26A0\uFE0F Gemini API Retry (${attempt + 1}/${maxRetries}) in ${Math.round(delay)}ms: ${errorMsg}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      console.log("\u26A0\uFE0F Gemini API Error:", errorMsg);
      break;
    }
  }
  return localFallbackTip;
};
var aiMemory = new import_chat_history.InMemoryChatMessageHistory();
var currentWeatherData = "Weather data unavailable.";
async function updateWeather() {
  try {
    const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=12.9716&longitude=77.5946&current=temperature_2m,relative_humidity_2m,precipitation&timezone=Asia%2FKolkata");
    const data = await res.json();
    if (data && data.current) {
      currentWeatherData = `Current temperature is ${data.current.temperature_2m}\xB0C, humidity is ${data.current.relative_humidity_2m}%, precipitation is ${data.current.precipitation}mm.`;
    }
  } catch (e) {
  }
}
updateWeather();
setInterval(updateWeather, 10 * 60 * 1e3);
var langchainConversation = null;
var getLangchainConversation = () => {
  if (!langchainConversation) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
    const model = new import_google_genai.ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash-lite",
      apiKey,
      temperature: 0.3,
      maxRetries: 3
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
    const prompt = import_prompts.ChatPromptTemplate.fromMessages([
      import_prompts.SystemMessagePromptTemplate.fromTemplate(systemPrompt),
      new import_prompts.MessagesPlaceholder("history"),
      import_prompts.HumanMessagePromptTemplate.fromTemplate("{input}")
    ]);
    const chain = prompt.pipe(model);
    langchainConversation = new import_runnables.RunnableWithMessageHistory({
      runnable: chain,
      getMessageHistory: () => aiMemory,
      inputMessagesKey: "input",
      historyMessagesKey: "history"
    });
  }
  return langchainConversation;
};
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { userText, history, systemPrompt } = import_zod2.z.object({
      userText: import_zod2.z.string().min(1),
      history: import_zod2.z.array(import_zod2.z.object({ role: import_zod2.z.string(), text: import_zod2.z.string() })).optional(),
      systemPrompt: import_zod2.z.string().optional()
    }).parse(req.body);
    const safeUserText = (0, import_xss2.default)(userText);
    const safeSystemPrompt = systemPrompt ? (0, import_xss2.default)(systemPrompt) : void 0;
    let contents = safeUserText;
    if (history && history.length > 0) {
      contents = history.map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: (0, import_xss2.default)(h.text) }]
      }));
      contents.push({ role: "user", parts: [{ text: safeUserText }] });
    }
    const ai = new import_genai.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: safeSystemPrompt,
        maxOutputTokens: 350,
        temperature: 0.7
      }
    });
    if (response.text) {
      res.json({ text: response.text });
    } else {
      res.status(500).json({ error: "No text returned from Gemini." });
    }
  } catch (error) {
    if (error instanceof import_zod2.z.ZodError) {
      return res.status(400).json({ error: "Invalid input" });
    }
    console.error(`[AI Chat Error]`, error.message);
    if (error.message && (error.message.includes("quota") || error.message.includes("429"))) {
      return res.status(429).json({ error: "EXHAUSTED" });
    }
    res.status(500).json({ error: error.message || "Failed to call AI." });
  }
});
app.post("/api/ai/ask", async (req, res) => {
  try {
    const schema = import_zod2.z.object({
      question: import_zod2.z.string().min(1),
      stream: import_zod2.z.boolean().optional(),
      location: import_zod2.z.object({ lat: import_zod2.z.number(), lng: import_zod2.z.number() }).optional()
    });
    const parsed = schema.parse(req.body);
    const question = (0, import_xss2.default)(parsed.question);
    const stream = parsed.stream;
    const location = parsed.location;
    let location_context = "Location not provided by user.";
    let nearest_hospital_context = "Cannot determine nearest hospital without user location.";
    if (location) {
      location_context = `Latitude: ${location.lat}, Longitude: ${location.lng}`;
      if (question.toLowerCase().includes("hospital") || question.toLowerCase().includes("clinic") || question.toLowerCase().includes("navigate") || question.toLowerCase().includes("nearest")) {
        try {
          const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY;
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
                    radius: 5e3
                  }
                }
              })
            });
            const hData = await hRes.json();
            if (hData && hData.places && hData.places.length > 0) {
              nearest_hospital_context = `The nearest hospital found via Places API is: ${hData.places[0].displayName?.text || "Unknown Hospital"}.`;
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
          res.setHeader("Content-Type", "text/event-stream");
          res.write(`data: ${JSON.stringify({ chunk: "HEILO bob how are you doing!" })}

`);
          return res.end();
        }
        return res.json({ answer: "HEILO bob how are you doing!" });
      }
      const trainedAns = findTrainedAnswer(question);
      if (trainedAns) {
        console.log(`[Ask API] Intercepted and answered directly using trained Q&As for: "${question}"`);
        if (stream) {
          res.setHeader("Content-Type", "text/event-stream");
          res.write(`data: ${JSON.stringify({ chunk: trainedAns })}

`);
          return res.end();
        }
        return res.json({ answer: trainedAns });
      }
      let chain = getLangchainConversation();
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        try {
          const streamResponse = await chain.stream(
            {
              input: question,
              current_time: (/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: "Asia/Kolkata", timeStyle: "long", dateStyle: "full" }),
              weather_info: currentWeatherData,
              location_context,
              nearest_hospital_context
            },
            { configurable: { sessionId: "default" } }
          );
          for await (const chunk of streamResponse) {
            if (chunk?.content) {
              res.write(`data: ${JSON.stringify({ chunk: chunk.content })}

`);
            }
          }
          return res.end();
        } catch (e) {
          console.error("[Ask API] Streaming error:", e.message);
          res.write(`data: ${JSON.stringify({ chunk: " I'm experiencing connectivity issues right now. Ensure standard safety protocols." })}

`);
          return res.end();
        }
      }
      let response;
      try {
        response = await chain.invoke(
          {
            input: question,
            current_time: (/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: "Asia/Kolkata", timeStyle: "long", dateStyle: "full" }),
            weather_info: currentWeatherData,
            location_context,
            nearest_hospital_context
          },
          { configurable: { sessionId: "default" } }
        );
      } catch (e) {
        const isQuota = e.message?.includes("exceeded your current quota") || e.message?.includes("Quota");
        if (isQuota) {
          console.log("[Ask API] Quota exceeded. Using safe local fallback.");
          response = { content: "I'm experiencing connectivity issues right now. Ensure standard safety protocols, apply firm pressure to any bleeding wounds, and wait for emergency services." };
        } else if (e.message?.includes("503") || e.message?.includes("UNAVAILABLE") || e.message?.includes("high demand") || e.message?.includes("429")) {
          console.log("[Ask API] gemini-2.5-flash-lite failed, falling back.");
          const apiKey = process.env.GEMINI_API_KEY;
          const fallbackModel = new import_google_genai.ChatGoogleGenerativeAI({
            model: "gemini-1.5-flash-8b",
            apiKey,
            temperature: 0.3,
            maxRetries: 0
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
          const prompt = import_prompts.ChatPromptTemplate.fromMessages([
            import_prompts.SystemMessagePromptTemplate.fromTemplate(systemPrompt),
            new import_prompts.MessagesPlaceholder("history"),
            import_prompts.HumanMessagePromptTemplate.fromTemplate("{input}")
          ]);
          const fallbackChain = new import_runnables.RunnableWithMessageHistory({
            runnable: prompt.pipe(fallbackModel),
            getMessageHistory: (sessionId) => aiMemory,
            inputMessagesKey: "input",
            historyMessagesKey: "history"
          });
          try {
            response = await fallbackChain.invoke(
              {
                input: question,
                current_time: (/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: "Asia/Kolkata", timeStyle: "long", dateStyle: "full" }),
                weather_info: currentWeatherData,
                location_context,
                nearest_hospital_context
              },
              { configurable: { sessionId: "default" } }
            );
          } catch (fallbackError) {
            console.log("[Ask API] Fallback also failed, using safe local fallback.");
            response = { content: "I'm experiencing connectivity issues right now. Ensure standard safety protocols." };
          }
        } else {
          console.log("[Ask API] Unexpected error:", e.message, "Falling back.");
          response = { content: "I'm having trouble connecting to my central systems, please ensure standard safety protocols." };
        }
      }
      let rawContent = typeof response.content === "string" ? response.content : "Sorry, I encountered an error.";
      let cleanAnswer = rawContent.replace(/([*_~`#])/g, "");
      res.json({ answer: cleanAnswer });
    } catch (error) {
      if (error.message?.includes("quota") || error.message?.includes("429")) {
        console.log("\u26A0\uFE0F AI Error: Quota/Rate Limit Exceeded.");
      } else {
        console.log("\u26A0\uFE0F AI Error:", error.message);
      }
      res.json({ answer: "I'm experiencing connectivity issues right now. How else can I assist you with safety?", error_detail: "Connection Issue" });
    }
  } catch (outerError) {
    if (outerError instanceof import_zod2.z.ZodError) {
      return res.status(400).json({ error: "Invalid input" });
    }
    return res.status(500).json({ error: outerError.message });
  }
});
var isDrivingModeActive = false;
var activeUserPhone = "";
var lastConfirmation = { confirmed: false, responder: "", timestamp: 0 };
app.get("/api/emergencies/confirmation-status", (req, res) => {
  res.json(lastConfirmation);
});
app.post("/api/emergencies/confirm", (req, res) => {
  try {
    const { responder } = import_zod2.z.object({ responder: import_zod2.z.string().optional().default("Regional Trauma Center") }).parse(req.body);
    const safeResponder = (0, import_xss2.default)(responder);
    lastConfirmation = {
      confirmed: true,
      responder: safeResponder,
      timestamp: Date.now()
    };
    console.log(`[Status] Manual confirmation received from: ${safeResponder}`);
    res.json({ success: true, lastConfirmation });
  } catch (err) {
    res.status(400).json({ error: "Invalid input" });
  }
});
app.post("/api/emergencies/confirmation-reset", (req, res) => {
  lastConfirmation = { confirmed: false, responder: "", timestamp: 0 };
  res.json({ success: true });
});
app.post("/api/twilio/sms", (req, res) => {
  try {
    const parsed = import_zod2.z.object({ Body: import_zod2.z.string().optional(), From: import_zod2.z.string().optional() }).parse(req.body);
    const body = (parsed.Body || "").toLowerCase().trim();
    const from = (0, import_xss2.default)(parsed.From || "Emergency Dispatch");
    console.log(`[Twilio Webhook] Received SMS reply: "${(0, import_xss2.default)(body)}" from ${from}`);
    const keywords = ["yes", "ok", "confirm", "coming", "on my way", "arrival", "ack", "active", "help", "en route", "dispatched", "will attend", "1"];
    const isConfirmed = keywords.some((kw) => body.includes(kw)) || body === "1";
    const twiml = new import_twilio.default.twiml.MessagingResponse();
    if (isConfirmed) {
      lastConfirmation = {
        confirmed: true,
        responder: from,
        timestamp: Date.now()
      };
      app.io.emit("help_arriving", lastConfirmation);
      twiml.message(`RoadSOS: Acknowledged. We are transmitting confirmation to the victim that help is arriving.`);
    } else {
      twiml.message(`RoadSOS Emergency: Response ignored or not understood. Send 'YES', 'OK', or '1' to confirm dispatch.`);
    }
    res.type("text/xml");
    res.send(twiml.toString());
  } catch (err) {
    if (err instanceof import_zod2.z.ZodError) {
      return res.status(400).json({ error: "Invalid input" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});
app.post("/api/twilio/call-gather", (req, res) => {
  try {
    const parsed = import_zod2.z.object({ Digits: import_zod2.z.string().optional() }).parse(req.body);
    const digits = (0, import_xss2.default)(parsed.Digits || "");
    const hostUrl = `${req.protocol}://${req.get("host")}`;
    console.log(`[Twilio Call Gather] Keypress digit received: ${digits}`);
    const twiml = new import_twilio.default.twiml.VoiceResponse();
    if (digits === "1") {
      twiml.say("Help is coming");
      twiml.hangup();
      setTimeout(() => {
        lastConfirmation = {
          confirmed: true,
          responder: "Ambulance Driver (+917892375787)",
          timestamp: Date.now()
        };
        app.io.emit("help_arriving", lastConfirmation);
      }, 0);
    } else {
      twiml.say("Command not recognized");
      twiml.hangup();
    }
    res.type("text/xml");
    res.send(twiml.toString());
  } catch (error) {
    console.error(`[Twilio webhook error]: ${error.message}`);
    const twiml = new import_twilio.default.twiml.VoiceResponse();
    twiml.say("An application error occurred.");
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
  }
});
app.post("/api/status/driving", (req, res) => {
  try {
    const { active, phone } = import_zod2.z.object({ active: import_zod2.z.boolean().optional(), phone: import_zod2.z.string().optional() }).parse(req.body);
    isDrivingModeActive = !!active;
    if (phone) {
      activeUserPhone = (0, import_xss2.default)(phone);
    }
    console.log(`[Status] Driving Mode: ${isDrivingModeActive ? "ENABLED" : "DISABLED"} for ${activeUserPhone}`);
    res.json({ success: true, isDrivingModeActive, activeUserPhone });
  } catch (err) {
    if (err instanceof import_zod2.z.ZodError) return res.status(400).json({ error: "Invalid input" });
    return res.status(500).json({ error: "Internal Error" });
  }
});
app.post("/api/twilio/voice", (req, res) => {
  console.log(`[Twilio Webhook] Received voice request. Driving Mode Active: ${isDrivingModeActive}`);
  const twiml = new import_twilio.default.twiml.VoiceResponse();
  if (isDrivingModeActive) {
    twiml.say("Bob is driving and will reach to you later.");
    twiml.hangup();
  } else {
    twiml.say("Connecting you to Bob.");
    if (activeUserPhone) {
      twiml.dial(activeUserPhone);
    } else {
      twiml.say("The user is currently available but Road SOS is in monitoring mode. Please try later or use the distress frequency.");
      twiml.hangup();
    }
  }
  res.type("text/xml");
  res.send(twiml.toString());
});
app.post("/api/sos/send-report", async (req, res) => {
  try {
    const { responder, logs, medicalInfo } = import_zod2.z.object({
      responder: import_zod2.z.string().min(1),
      logs: import_zod2.z.array(import_zod2.z.any()).optional(),
      medicalInfo: import_zod2.z.record(import_zod2.z.any()).optional()
    }).parse(req.body);
    const safeResponder = (0, import_xss2.default)(responder);
    try {
      const doc = new import_pdfkit.default();
      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.fontSize(20).text("RoadSOS Accident Report", { align: "center" });
      doc.moveDown();
      const safeName = medicalInfo?.name ? (0, import_xss2.default)(medicalInfo.name) : "Unknown";
      const safeBlood = medicalInfo?.bloodGroup ? (0, import_xss2.default)(medicalInfo.bloodGroup) : "Unknown";
      const safeCond = medicalInfo?.conditions ? (0, import_xss2.default)(medicalInfo.conditions) : "None";
      doc.fontSize(14).text(`Patient Name: ${safeName}`);
      doc.text(`Blood Group: ${safeBlood}`);
      doc.text(`Medical Conditions: ${safeCond}`);
      doc.moveDown();
      doc.fontSize(16).text("Recent Accident Logs:");
      doc.fontSize(12);
      (logs || []).forEach((log) => {
        const msg = typeof log.message === "string" ? (0, import_xss2.default)(log.message) : "";
        doc.text(`[${new Date(log.timestamp).toLocaleString()}] ${msg}`);
      });
      doc.end();
      doc.on("end", async () => {
        const pdfData = Buffer.concat(buffers);
        const reportId = import_crypto2.default.randomUUID();
        reportStore.set(reportId, pdfData);
        setTimeout(() => reportStore.delete(reportId), 12 * 60 * 60 * 1e3);
        let reportUrl = "";
        try {
          const client = getTwilio();
          const from = process.env.TWILIO_FROM_NUMBER;
          const hostUrl = `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`;
          reportUrl = `${hostUrl}/api/report/${reportId}.pdf`;
          await client.messages.create({
            body: `RoadSOS: Victim's Medical & Accident Logs PDF Report available here: ${reportUrl}`,
            from,
            to: safeResponder
          });
          res.json({ success: true, reportId, reportUrl });
        } catch (err) {
          if (err.message && err.message.includes("Authenticate")) {
            console.error("Twilio report send error: Twilio Authentication Failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Settings.");
            res.status(500).json({ error: err.message });
          } else if (err.message && (err.message.includes("unverified") || err.message.includes("Trial account"))) {
            console.error("Twilio report send error (Mocking Success due to Trial Account):", err.message);
            res.json({ success: true, reportId, reportUrl, mocked: true });
          } else {
            console.error("Twilio report send error:", err);
            res.status(500).json({ error: err.message });
          }
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } catch (zErr) {
    if (zErr instanceof import_zod2.z.ZodError) return res.status(400).json({ error: "Invalid input" });
    res.status(500).json({ error: "Validation Error" });
  }
});
app.get("/api/report/:id.pdf", (req, res) => {
  const data = reportStore.get(req.params.id);
  if (!data) return res.status(404).send("Report not found or expired");
  res.contentType("application/pdf");
  res.send(data);
});
var SUPABASE_URL2 = process.env.SUPABASE_URL || "";
var SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
var supabase2 = (0, import_supabase_js2.createClient)(SUPABASE_URL2, SUPABASE_ANON_KEY);
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
app.get("/api/config/maps", (req, res) => {
  res.json({ apiKey: process.env.GOOGLE_MAPS_PLATFORM_KEY || "" });
});
app.get("/api/health/traffic", async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY;
  if (!apiKey) {
    return res.status(500).json({ status: "error", message: "Missing GOOGLE_MAPS_PLATFORM_KEY" });
  }
  try {
    const response = await fetch(`https://routes.googleapis.com/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters"
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: 12.9716, longitude: 77.5946 } } },
        destination: { location: { latLng: { latitude: 12.9716, longitude: 77.6 } } },
        travelMode: "DRIVE"
      }),
      // Using an abort controller for timeout resilience (e.g. 5000ms limit)
      signal: AbortSignal.timeout(5e3)
    });
    if (response.status === 429) {
      return res.status(429).json({ status: "degraded", message: "Rate limit exceeded on Traffic API" });
    }
    if (!response.ok) {
      return res.status(response.status).json({ status: "error", message: `Traffic API returned ${response.status}` });
    }
    const data = await response.json();
    if (data && data.routes) {
      return res.json({ status: "healthy" });
    } else {
      return res.status(500).json({ status: "error", message: "Invalid payload schema from Traffic API" });
    }
  } catch (error) {
    if (error.name === "TimeoutError") {
      return res.status(504).json({ status: "error", message: "Traffic API connection timed out" });
    }
    return res.status(500).json({ status: "error", message: error.message });
  }
});
app.get("/api/config/twilio", (req, res) => {
  res.json({ phoneNumber: process.env.TWILIO_FROM_NUMBER || "+1234567890" });
});
app.get("/api/diagnostics/twilio", (req, res) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNum = process.env.TWILIO_FROM_NUMBER;
  const hostUrl = `${req.protocol}://${req.get("host")}`;
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
app.post("/api/emergencies/log", async (req, res) => {
  try {
    const { details, location, type } = import_zod2.z.object({
      details: import_zod2.z.record(import_zod2.z.any()).optional(),
      location: import_zod2.z.object({ lat: import_zod2.z.number(), lng: import_zod2.z.number() }).optional(),
      type: import_zod2.z.string().optional()
    }).parse(req.body);
    try {
      const logEntry = {
        serialized_payload: JSON.stringify(details || {}),
        facility_name: details?.facility ? (0, import_xss2.default)(details.facility) : "Unknown",
        lat: location?.lat || 0,
        lng: location?.lng || 0,
        injury_tag: type ? (0, import_xss2.default)(type) : "voice_interaction"
      };
      const { data, error } = await supabase2.from("emergency_logs").insert([logEntry]);
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error) {
      console.log("\u26A0\uFE0F Supabase Log Error:", error.message);
      res.status(500).json({ error: "Storage Failure" });
    }
  } catch (zErr) {
    if (zErr instanceof import_zod2.z.ZodError) return res.status(400).json({ error: "Invalid input" });
    res.status(500).json({ error: "Server Error" });
  }
});
app.post("/api/ai/voice-process", async (req, res) => {
  try {
    const { transcript } = import_zod2.z.object({ transcript: import_zod2.z.string().min(1) }).parse(req.body);
    const safeTranscript = (0, import_xss2.default)(transcript);
    try {
      const trainedAns = findTrainedAnswer(safeTranscript);
      if (trainedAns) {
        console.log(`[Voice Process] Intercepted and answered directly using trained Q&As for: "${safeTranscript}"`);
        return res.json({ mode: "TRAINING", content: trainedAns, original_transcript: safeTranscript });
      }
      const prompt = `
        You are a high-speed emergency response AI.
        Analyze: "${safeTranscript}"
        
        OUTPUT FORMAT:
        [MODE: EMERGENCY/TRAINING/GENERAL]
        Content: [Short, direct response. Under 30 words.]

        Context: ${KNOWLEDGE_BASE_CONTEXT}
      `;
      const text2 = await generateAIResponse(prompt, true);
      let mode = "GENERAL";
      if (text2.includes("[MODE: EMERGENCY]")) mode = "EMERGENCY";
      else if (text2.includes("[MODE: TRAINING]")) mode = "TRAINING";
      res.json({ mode, content: text2.replace(/\[MODE: .*?\]/, "").replace(/Content:/, "").trim(), original_transcript: safeTranscript });
    } catch (error) {
      if (error?.message?.includes("quota") || error?.message?.includes("429")) {
        console.log("\u26A0\uFE0F AI Error: Quota.");
      } else {
        console.log("\u26A0\uFE0F AI Error.");
      }
      res.json({ mode: "GENERAL", content: "Ensure safety, check breathing and pulse, apply firm pressure to wounds to stop bleeding, and wait for emergency services.", original_transcript: safeTranscript });
    }
  } catch (zerr) {
    res.status(400).json({ error: "Invalid transcript" });
  }
});
app.post("/api/sos/notify", async (req, res) => {
  lastConfirmation = { confirmed: false, responder: "", timestamp: 0 };
  try {
    const { recipients, message } = import_zod2.z.object({
      recipients: import_zod2.z.array(import_zod2.z.string()).min(1),
      message: import_zod2.z.string().min(1)
    }).parse(req.body);
    const safeMessage = (0, import_xss2.default)(message);
    const safeRecipients = recipients.map((r) => Math.random() ? r : r);
    console.log(`[SMS] Attempting to notify: ${safeRecipients}`);
    try {
      const client = getTwilio();
      const from = process.env.TWILIO_FROM_NUMBER;
      if (!from) {
        console.error("[SMS] Error: TWILIO_FROM_NUMBER is not set.");
        throw new Error("TWILIO_FROM_NUMBER is missing");
      }
      const results = [];
      for (const to of safeRecipients) {
        const formattedTo = to.trim().startsWith("+") ? to.trim() : `+${to.trim()}`;
        console.log(`[SMS] Sending to: ${formattedTo} from: ${from}`);
        try {
          const result = await client.messages.create({
            body: safeMessage,
            to: formattedTo,
            from
          });
          results.push({ status: "fulfilled", value: result });
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (err) {
          if (err.message && err.message.includes("Authenticate")) {
            console.error(`[SMS] Failed to send to ${formattedTo}: Twilio Authentication Error. Please check your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in the AI Studio Settings menu.`);
            results.push({ status: "rejected", reason: err });
          } else if (err.message && (err.message.includes("unverified") || err.message.includes("Trial account"))) {
            console.warn(`[SMS] Mocking success to ${formattedTo} due to Twilio trial constraints`);
            results.push({ status: "fulfilled", value: { sid: "mock_sid_trial" }, mocked: true });
          } else {
            console.error(`[SMS] Failed to send to ${formattedTo}:`, err);
            results.push({ status: "rejected", reason: err });
          }
        }
      }
      console.log(`[SMS] Delivered to ${results.filter((r) => r.status === "fulfilled").length} recipients.`);
      res.json({ success: true, results });
    } catch (error) {
      console.log("\u26A0\uFE0F Twilio SMS Error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  } catch (zerr) {
    res.status(400).json({ error: "Invalid notify data" });
  }
});
app.post("/api/sos/call-neon", async (req, res) => {
  try {
    const { to, patientName } = import_zod2.z.object({
      to: import_zod2.z.string().optional().default("+916361892311"),
      patientName: import_zod2.z.string().optional().default("BOB")
    }).parse(req.body);
    const safeTo = (0, import_xss2.default)(to);
    const safePatient = (0, import_xss2.default)(patientName);
    console.log(`[Neon Distress] Attempting to call: ${safeTo}`);
    try {
      const client = getTwilio();
      const from = process.env.TWILIO_FROM_NUMBER;
      if (!from) throw new Error("TWILIO_FROM_NUMBER is missing");
      const formattedTo = safeTo.trim().startsWith("+") ? safeTo.trim() : `+${safeTo.trim()}`;
      const hostUrl = `https://${req.get("host")}`;
      const twimlString = `<Response>
        <Gather numDigits="1" action="${hostUrl}/api/twilio/call-neon-gather?patient=${encodeURIComponent(safePatient)}" timeout="15" method="POST">
          <Say>${safePatient} is in danger. ${safePatient} is in danger. Press 1 to acknowledge.</Say>
        </Gather>
        <Say>No confirmation received.</Say>
      </Response>`;
      const call = await client.calls.create({
        twiml: twimlString,
        to: formattedTo,
        from
      });
      console.log(`[Neon Call] SID: ${call.sid}`);
      res.json({ success: true, callSid: call.sid });
    } catch (error) {
      if (error.message && error.message.includes("Authenticate")) {
        console.log("\u26A0\uFE0F Neon Call Error: Twilio Authentication Failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Settings.");
        res.status(500).json({ success: false, error: error.message });
      } else if (error.message && (error.message.includes("unverified") || error.message.includes("Trial account"))) {
        console.log("\u26A0\uFE0F Neon Call Mocked due to Twilio trial constraints.");
        res.json({ success: true, callSid: "mock_sid_trial", mocked: true });
      } else {
        console.log("\u26A0\uFE0F Neon Call Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  } catch (zerr) {
    res.status(400).json({ error: "Invalid input" });
  }
});
app.post("/api/twilio/call-neon-gather", (req, res) => {
  try {
    const digits = req.body.Digits;
    const patient = req.query.patient || "BOB";
    console.log(`[Twilio Call Neon Gather] Keypress digit received: ${digits}`);
    const twiml = new import_twilio.default.twiml.VoiceResponse();
    if (digits === "1") {
      twiml.say({ loop: 3 }, `${patient} is in danger!`);
      twiml.hangup();
      setTimeout(() => {
        app.io.emit("neon_confirmed", { timestamp: Date.now() });
      }, 0);
    } else {
      twiml.say("Command not recognized.");
      twiml.hangup();
    }
    res.type("text/xml");
    res.send(twiml.toString());
  } catch (error) {
    console.error(`[Twilio neon call webhook error]: ${error.message}`);
    const twiml = new import_twilio.default.twiml.VoiceResponse();
    twiml.say("An application error occurred.");
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
  }
});
app.post("/api/sos/call-initiate", async (req, res) => {
  try {
    const { to, message, host } = import_zod2.z.object({
      to: import_zod2.z.string().optional().default("+917892375787"),
      message: import_zod2.z.string().optional(),
      host: import_zod2.z.string().optional()
    }).parse(req.body);
    const safeTo = (0, import_xss2.default)(to);
    const safeMessage = message ? (0, import_xss2.default)(message) : void 0;
    const safeHost = host ? (0, import_xss2.default)(host) : void 0;
    console.log(`[Call] Attempting to call: ${safeTo}`);
    try {
      const client = getTwilio();
      const from = process.env.TWILIO_FROM_NUMBER;
      if (!from) throw new Error("TWILIO_FROM_NUMBER is missing");
      const formattedTo = safeTo.trim().startsWith("+") ? safeTo.trim() : `+${safeTo.trim()}`;
      const hostUrl = safeHost || `https://${req.get("host")}`;
      const twimlString = `<Response>
        <Gather numDigits="1" action="${hostUrl}/api/twilio/call-gather" timeout="15" method="POST">
          <Say>${safeMessage || "Emergency. Please press 1 to confirm dispatch of help."}</Say>
        </Gather>
        <Say>We did not receive confirmation.</Say>
      </Response>`;
      const call = await client.calls.create({
        twiml: twimlString,
        to: formattedTo,
        from
      });
      res.json({ success: true, callSid: call.sid });
    } catch (error) {
      if (error.message && error.message.includes("Authenticate")) {
        console.log("\u26A0\uFE0F Twilio Call Error: Twilio Authentication Failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Settings.");
        res.status(500).json({ success: false, error: error.message });
      } else if (error.message && (error.message.includes("unverified") || error.message.includes("Trial account"))) {
        console.log("\u26A0\uFE0F Twilio Call Mocked due to trial constraints.");
        res.json({ success: true, callSid: "mock_sid_trial", mocked: true });
      } else {
        console.log("\u26A0\uFE0F Twilio Call Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  } catch (zerr) {
    res.status(400).json({ error: "Invalid input" });
  }
});
var voiceAgentMutex = Promise.resolve();
app.post("/api/ai/voice-agent", async (req, res) => {
  try {
    const { transcript, location, history } = import_zod2.z.object({
      transcript: import_zod2.z.string().optional(),
      location: import_zod2.z.object({ lat: import_zod2.z.number(), lng: import_zod2.z.number() }).optional(),
      history: import_zod2.z.array(import_zod2.z.any()).optional()
    }).parse(req.body);
    const safeTranscript = (0, import_xss2.default)(transcript || "");
    const cleanTranscript = safeTranscript.trim();
    if (!cleanTranscript || cleanTranscript.length === 0) {
      return res.json({ text: "I'm listening." });
    }
    const executeVoiceAgent = async () => {
      try {
        const ai = getAI();
        const execute_sos_dispatch = {
          name: "execute_sos_dispatch",
          description: "ONLY trigger the SOS emergency dispatch if the user EXPLICITLY states they are in a life-threatening emergency, have had a severe accident, or explicitly ask for an ambulance. DO NOT use this for general questions, inquiries, or casual chat.",
          parameters: {
            type: import_genai.Type.OBJECT,
            properties: { type: { type: import_genai.Type.STRING, description: "The type of emergency, e.g. medical, crash, danger" } },
            required: ["type"]
          }
        };
        const Maps_to_nearest_hospital = {
          name: "Maps_to_nearest_hospital",
          description: "Triggers the Google Places API and routing to navigate to the nearest hospital on the map.",
          parameters: {
            type: import_genai.Type.OBJECT,
            properties: {},
            required: []
          }
        };
        const toggle_traffic_layer = {
          name: "toggle_traffic_layer",
          description: "Turns the Google Maps traffic layer on or off.",
          parameters: {
            type: import_genai.Type.OBJECT,
            properties: { state: { type: import_genai.Type.BOOLEAN, description: "True to turn traffic on, false to turn it off." } },
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
        const historyStr = history && Array.isArray(history) && history.length > 0 ? "Conversation History:\n" + history.map((msg) => `${msg.role.toUpperCase()}: ${msg.text}`).join("\n") + "\n\n" : "";
        const userPrompt = `${historyStr}${req.body.trafficContext ? "\n" + req.body.trafficContext + "\n\n" : ""}User request: "${cleanTranscript}". Current location coords: ${location ? JSON.stringify(location) : "Unknown"}. Please answer the user's request. If it is a direct command that requires a tool, trigger the appropriate tool. Otherwise, provide a conversational and concise response.`;
        const generateVoiceResponse = async () => {
          let lastError = null;
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
            } catch (e) {
              lastError = e;
              if (e.message?.includes("429") || e.message?.includes("503")) {
                await new Promise((r) => setTimeout(r, 1e3 * Math.pow(2, attempt)));
                continue;
              }
              throw e;
            }
          }
          throw lastError;
        };
        const response = await generateVoiceResponse();
        const calls = response.functionCalls;
        if (calls && calls.length > 0) {
          return res.json({ toolCall: { name: calls[0].name, args: calls[0].args }, text: "Executing command." });
        }
        const chain = getLangchainConversation();
        const lcResponse = await chain.invoke(
          {
            input: cleanTranscript,
            current_time: (/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: "Asia/Kolkata", timeStyle: "long", dateStyle: "full" }),
            weather_info: currentWeatherData,
            location_context: location ? JSON.stringify(location) : "Unknown",
            nearest_hospital_context: "Not provided in this context"
          },
          { configurable: { sessionId: "voice-agent" } }
        );
        return res.json({ text: lcResponse.content });
      } catch (error) {
        if (error.message?.includes("quota") || error.message?.includes("Quota") || error.message?.includes("429") || error.message?.includes("503") || error.message?.includes("UNAVAILABLE")) {
          console.log("\u26A0\uFE0F Voice Agent is at full capacity (Quota/Rate Limit). Using local Q&A fallback.");
          const fallbackAns = findTrainedAnswer(transcript);
          if (fallbackAns) {
            return res.json({ text: fallbackAns });
          }
          return res.json({ text: "I'm experiencing high network traffic, but I'm here. How can I help you stay safe?" });
        }
        console.log("\u26A0\uFE0F Voice Agent Auth/Request Issue.", error.message);
        return res.json({ text: "I experienced a temporary disconnect from my systems, but I am still listening." });
      }
    };
    const nextMutex = voiceAgentMutex.then(() => executeVoiceAgent()).catch(() => executeVoiceAgent());
    voiceAgentMutex = nextMutex;
  } catch (zerr) {
    res.status(400).json({ error: "Invalid input" });
  }
});
var trafficCache = /* @__PURE__ */ new Map();
app.post("/api/traffic-updates", async (req, res) => {
  try {
    const { lat, lng, locationName } = import_zod2.z.object({
      lat: import_zod2.z.number().optional(),
      lng: import_zod2.z.number().optional(),
      locationName: import_zod2.z.string().optional()
    }).parse(req.body);
    const safeLocName = locationName ? (0, import_xss2.default)(locationName) : void 0;
    if (!safeLocName && (!lat || !lng)) return res.status(400).json({ error: "Missing location" });
    const cacheKey = safeLocName ? safeLocName.toLowerCase() : `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const cached = trafficCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1e3) {
      return res.json({ update: cached.result });
    }
    try {
      const ai = getAI();
      let prompt = "";
      if (safeLocName) {
        prompt = `Give me a concise real-time traffic update (under 30 words) on traffic jams, accident reports, or road closures within a 2-3 km radius of ${safeLocName}. CRITICAL: Give the actual street names and area names where the traffic is. Format as plain text.`;
      } else {
        prompt = `Give me a concise real-time traffic update (under 30 words) on traffic jams, accident reports, or road closures within a 2 to 3 km radius of latitude ${lat}, longitude ${lng}. CRITICAL: Give the actual street names and area names where the traffic is. DO NOT output the latitude and longitude coordinates in your response. Format as plain text.`;
      }
      const generateCall = async (modelName, retries = 2) => {
        for (let i = 0; i < retries; i++) {
          try {
            return await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                tools: [{ googleSearch: {} }]
              }
            });
          } catch (e) {
            const isQuota = e.message?.includes("exceeded your current quota") || e.message?.includes("Quota exceeded");
            if (isQuota) {
              console.log(`[Ask API] Quota exceeded for model ${modelName}, failing fast.`);
              throw new Error("QUOTA_EXCEEDED");
            }
            if ((e.message?.includes("503") || e.message?.includes("UNAVAILABLE") || e.message?.includes("high demand") || e.message?.includes("429")) && i < retries - 1) {
              console.log(`Traffic Update retry ${i + 1} due to rate limiting`);
              await new Promise((res2) => setTimeout(res2, 1e3));
              continue;
            }
            throw e;
          }
        }
      };
      let response;
      try {
        response = await generateCall("gemini-2.5-flash-lite");
      } catch (e) {
        if (e.message !== "QUOTA_EXCEEDED") {
          console.log("\u26A0\uFE0F Traffic Update fallback hit:", e.message);
        }
        const text2 = "Traffic is currently moderate with standard delays. Always drive safely.";
        trafficCache.set(cacheKey, { result: text2, timestamp: Date.now() });
        return res.json({ update: text2 });
      }
      trafficCache.set(cacheKey, { result: text, timestamp: Date.now() });
      res.json({ update: text });
    } catch (error) {
      if (error.message?.includes("quota") || error.message?.includes("429")) {
        console.log("\u26A0\uFE0F Traffic Update Rate Limit hit.");
      } else {
        console.log("\u26A0\uFE0F Traffic Update Error.");
      }
      res.json({ update: "Traffic is currently moderate with standard delays. Always drive safely." });
    }
  } catch (zerr) {
    res.status(400).json({ error: "Invalid input" });
  }
});
app.get("/api/geoapify/nearby", async (req, res) => {
  try {
    const parsed = import_zod2.z.object({ lat: import_zod2.z.string(), lng: import_zod2.z.string() }).parse(req.query);
    const lat = (0, import_xss2.default)(parsed.lat);
    const lng = (0, import_xss2.default)(parsed.lng);
    const GEO_API_KEY = process.env.GEOAPIFY_API_KEY || "fallback_geoapify_key";
    const url = `https://api.geoapify.com/v2/places?categories=healthcare.hospital,service.police,service.fire_station&filter=circle:${lng},${lat},5000&limit=8&apiKey=${GEO_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/geoapify/reverse", async (req, res) => {
  try {
    const parsed = import_zod2.z.object({ lat: import_zod2.z.string(), lng: import_zod2.z.string() }).parse(req.query);
    const lat = (0, import_xss2.default)(parsed.lat);
    const lng = (0, import_xss2.default)(parsed.lng);
    const GEO_API_KEY = process.env.GEOAPIFY_API_KEY || "fallback_geoapify_key";
    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${GEO_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/places/nearby", async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Google Maps API key not configured on server" });
    }
    const body = import_zod2.z.record(import_zod2.z.any()).parse(req.body);
    const rawMask = req.headers["x-goog-fieldmask"];
    const fieldMask = rawMask ? (0, import_xss2.default)(rawMask) : "places.displayName,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber";
    const placesUrl = `https://places.googleapis.com/v1/places:searchNearby`;
    const response = await fetch(placesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.json(data);
  } catch (error) {
    console.log("\u26A0\uFE0F Places API Proxy Error:", error.message);
    res.status(500).json({ error: "Places API Proxy Failure" });
  }
});
app.post("/api/places/search", async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Google Maps API key not configured on server" });
    }
    const body = import_zod2.z.record(import_zod2.z.any()).parse(req.body);
    const rawMask = req.headers["x-goog-fieldmask"];
    const fieldMask = rawMask ? (0, import_xss2.default)(rawMask) : "places.displayName,places.location,places.formattedAddress";
    const placesUrl = `https://places.googleapis.com/v1/places:searchText`;
    const response = await fetch(placesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.json(data);
  } catch (error) {
    console.log("\u26A0\uFE0F Places API Proxy Error:", error.message);
    res.status(500).json({ error: "Places API Proxy Failure" });
  }
});
app.use((err, req, res, next) => {
  console.error(`[API Error] ${req.method} ${req.url} - ${err.message}`, err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const viteMod = "vite";
    const { createServer: createViteServer } = await import(
      /* @vite-ignore */
      viteMod
    );
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(import_express2.default.static(import_path.default.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(process.cwd(), "dist", "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
if (process.env.VERCEL) {
} else {
  startServer();
}
var api_default = app;
//# sourceMappingURL=server.cjs.map
