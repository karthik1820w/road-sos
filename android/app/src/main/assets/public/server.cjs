"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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

// api/auth.ts
var auth_exports = {};
__export(auth_exports, {
  authenticateToken: () => authenticateToken,
  default: () => auth_default
});
var import_express4, import_bcryptjs, import_jsonwebtoken2, import_express_rate_limit, import_supabase_js2, import_zod4, import_xss4, import_crypto3, router, _supabase, getSupabase, supabase2, getJwtSecret, JWT_EXPIRES_IN, emailPasswordSchema, tokenSchema, resetPasswordSchema, loginLimiter, registerLimiter, resetLimiter, authenticateToken, auth_default;
var init_auth = __esm({
  "api/auth.ts"() {
    "use strict";
    import_express4 = __toESM(require("express"), 1);
    import_bcryptjs = __toESM(require("bcryptjs"), 1);
    import_jsonwebtoken2 = __toESM(require("jsonwebtoken"), 1);
    import_express_rate_limit = __toESM(require("express-rate-limit"), 1);
    import_supabase_js2 = require("@supabase/supabase-js");
    import_zod4 = require("zod");
    import_xss4 = __toESM(require("xss"), 1);
    import_crypto3 = __toESM(require("crypto"), 1);
    router = import_express4.default.Router();
    _supabase = null;
    getSupabase = () => {
      if (!_supabase) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error("Supabase is not configured (SUPABASE_URL / key)");
        _supabase = (0, import_supabase_js2.createClient)(url, key);
      }
      return _supabase;
    };
    supabase2 = new Proxy({}, { get: (_t, prop) => getSupabase()[prop] });
    getJwtSecret = () => {
      const s = process.env.JWT_SECRET;
      if (!s) throw new Error("JWT_SECRET environment variable is required");
      return s;
    };
    JWT_EXPIRES_IN = "1h";
    emailPasswordSchema = import_zod4.z.object({
      email: import_zod4.z.string().email(),
      password: import_zod4.z.string().min(8)
    });
    tokenSchema = import_zod4.z.object({
      token: import_zod4.z.string().min(10)
    });
    resetPasswordSchema = import_zod4.z.object({
      token: import_zod4.z.string().min(10),
      newPassword: import_zod4.z.string().min(8)
    });
    loginLimiter = (0, import_express_rate_limit.default)({
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
    registerLimiter = (0, import_express_rate_limit.default)({
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
    resetLimiter = (0, import_express_rate_limit.default)({
      windowMs: 60 * 60 * 1e3,
      max: 5,
      handler: (req, res) => {
        console.warn(`[Security Alert] Too many password reset requests from IP ${req.ip}`);
        res.status(429).json({ error: "Too many password reset requests from this IP, please try again after 1 hour" });
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    authenticateToken = (req, res, next) => {
      const token = req.cookies?.token || req.headers["authorization"]?.split(" ")[1];
      if (!token) return res.status(401).json({ error: "Access denied: No token provided" });
      import_jsonwebtoken2.default.verify(token, getJwtSecret(), (err, user) => {
        if (err) return res.status(403).json({ error: "Access denied: Invalid or expired session" });
        req.user = user;
        next();
      });
    };
    router.post("/register", registerLimiter, async (req, res) => {
      try {
        const { email, password } = emailPasswordSchema.parse(req.body);
        const safeEmail = (0, import_xss4.default)(email);
        const salt = await import_bcryptjs.default.genSalt(12);
        const passwordHash = await import_bcryptjs.default.hash(password, salt);
        const verificationToken = import_crypto3.default.randomBytes(32).toString("hex");
        const { data: existingUser } = await supabase2.from("app_users").select("id").eq("email", email).single();
        if (existingUser) return res.status(409).json({ error: "Email already in use" });
        const { error } = await supabase2.from("app_users").insert([{
          email,
          password_hash: passwordHash,
          is_verified: false,
          verification_token: verificationToken
        }]);
        if (error) throw error;
        console.log(`[Email Service] Verification link: http://localhost:3000/api/auth/verify?token=${verificationToken}`);
        res.status(201).json({ message: "User registered successfully. Please verify your email." });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    router.get("/verify", async (req, res) => {
      try {
        const { token } = tokenSchema.parse({ token: req.query.token });
        const safeToken = (0, import_xss4.default)(token);
        const { data: user, error } = await supabase2.from("app_users").select("id, is_verified").eq("verification_token", safeToken).single();
        if (error || !user) return res.status(400).json({ error: "Invalid or expired verification token" });
        await supabase2.from("app_users").update({ is_verified: true, verification_token: null }).eq("id", user.id);
        res.send("Email successfully verified. You can now log in.");
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    router.post("/login", loginLimiter, async (req, res) => {
      try {
        const { email, password } = emailPasswordSchema.parse(req.body);
        const safeEmail = (0, import_xss4.default)(email);
        console.log(`[Auth attempt] Login attempt for ${safeEmail} from IP: ${req.ip} or ${req.headers["x-forwarded-for"]}`);
        const { data: user, error } = await supabase2.from("app_users").select("id, password_hash, is_verified").eq("email", safeEmail).single();
        if (error || !user) {
          console.warn(`[Auth failure] Invalid email for ${safeEmail} from IP: ${req.ip}`);
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
        const token = import_jsonwebtoken2.default.sign({ id: user.id, email: safeEmail }, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
        res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          maxAge: 36e5,
          // 1h
          sameSite: "strict"
        });
        res.json({ message: "Login successful" });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    router.post("/forgot-password", resetLimiter, async (req, res) => {
      try {
        const schema = import_zod4.z.object({ email: import_zod4.z.string().email() });
        const { email } = schema.parse(req.body);
        const safeEmail = (0, import_xss4.default)(email);
        const resetToken = import_crypto3.default.randomBytes(32).toString("hex");
        const resetTokenExpires = new Date(Date.now() + 36e5).toISOString();
        const { data: user, error } = await supabase2.from("app_users").select("id").eq("email", safeEmail).single();
        if (!error && user) {
          await supabase2.from("app_users").update({ reset_token: resetToken, reset_token_expires: resetTokenExpires }).eq("id", user.id);
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
        const safeToken = (0, import_xss4.default)(token);
        const { data: user, error } = await supabase2.from("app_users").select("id, reset_token_expires").eq("reset_token", safeToken).single();
        if (error || !user) return res.status(400).json({ error: "Invalid or expired reset token" });
        if (new Date(user.reset_token_expires) < /* @__PURE__ */ new Date()) {
          return res.status(400).json({ error: "Reset token has expired" });
        }
        const salt = await import_bcryptjs.default.genSalt(12);
        const newPasswordHash = await import_bcryptjs.default.hash(newPassword, salt);
        await supabase2.from("app_users").update({
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
    auth_default = router;
  }
});

// api/index.ts
var api_exports = {};
__export(api_exports, {
  default: () => api_default
});
module.exports = __toCommonJS(api_exports);
var import_helmet = __toESM(require("helmet"), 1);
var import_express5 = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_supabase_js3 = require("@supabase/supabase-js");
var import_genai3 = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_twilio3 = __toESM(require("twilio"), 1);
var import_http = require("http");
var import_socket = require("socket.io");
var import_cookie_parser = __toESM(require("cookie-parser"), 1);
var import_zod5 = require("zod");
var import_xss5 = __toESM(require("xss"), 1);

// api/incidents.ts
var import_express = __toESM(require("express"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_zod = require("zod");
var import_xss = __toESM(require("xss"), 1);
var import_twilio = __toESM(require("twilio"), 1);
var import_pdfkit = __toESM(require("pdfkit"), 1);
var import_qrcode = __toESM(require("qrcode"), 1);

// api/medical.ts
var import_genai2 = require("@google/genai");

// api/rag.ts
var import_supabase_js = require("@supabase/supabase-js");
var import_genai = require("@google/genai");
var supabaseConfigured = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
var supabase = supabaseConfigured ? (0, import_supabase_js.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY) : null;
var _ai = null;
var getAI = () => {
  if (!_ai) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set.");
    }
    _ai = new import_genai.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
};
async function retrieveContext(query, domain, k = 5) {
  try {
    const ai = getAI();
    const embedRes = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: query
    });
    const embedding = embedRes.embeddings?.[0]?.values;
    if (!embedding || !supabase) return [];
    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: k,
      filter_domain: domain || null
    });
    if (error) {
      console.error("[RAG] Supabase match error:", error);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error("[RAG] Embedding error:", e);
    return [];
  }
}

// api/aiConfig.ts
var AI_TIERS = {
  emergencyMedical: { model: "gemini-3.1-pro", temperature: 0.08, maxOutputTokens: 600 },
  roadRulesGeneral: { model: "gemini-3.1-pro", temperature: 0.4, maxOutputTokens: 350 },
  weatherTimeSmallTalk: { model: "gemini-2.5-flash-lite", temperature: 0.75, maxOutputTokens: 250 },
  toolCalling: { model: "gemini-2.5-flash-lite", temperature: 0, maxOutputTokens: 200 }
};
var MEDICAL_CONFIDENCE_THRESHOLD = 0.7;

// api/medical.ts
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}
async function fetchNearbyHospitals(lat, lng, radiusM = 1e4) {
  const googleApiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY;
  if (googleApiKey) {
    try {
      const placesUrl = "https://places.googleapis.com/v1/places:searchNearby";
      const res = await fetch(placesUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googleApiKey,
          "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.primaryType"
        },
        body: JSON.stringify({
          includedTypes: ["hospital"],
          maxResultCount: 8,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: radiusM
            }
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.places && Array.isArray(data.places) && data.places.length > 0) {
          return data.places.map((p) => ({
            name: p.displayName?.text || p.formattedAddress || "Medical Facility",
            address: p.formattedAddress || "",
            lat: p.location?.latitude ?? lat,
            lng: p.location?.longitude ?? lng,
            phone: p.nationalPhoneNumber || p.internationalPhoneNumber,
            rating: p.rating,
            userRatingCount: p.userRatingCount
          }));
        }
      }
    } catch (e) {
      console.warn("[MedicalService] Google Places API lookup failed, trying fallback:", e.message);
    }
  }
  const geoApiKey = process.env.GEOAPIFY_API_KEY;
  if (geoApiKey) {
    try {
      const geoUrl = `https://api.geoapify.com/v2/places?categories=healthcare.hospital&filter=circle:${lng},${lat},${radiusM}&limit=8&apiKey=${geoApiKey}`;
      const res = await fetch(geoUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.features && Array.isArray(data.features) && data.features.length > 0) {
          return data.features.map((f) => ({
            name: f.properties?.name || f.properties?.address_line1 || "Hospital",
            address: f.properties?.formatted || f.properties?.address_line2 || "",
            lat: f.geometry?.coordinates?.[1] ?? lat,
            lng: f.geometry?.coordinates?.[0] ?? lng,
            phone: f.properties?.contact?.phone || f.properties?.datasource?.raw?.phone,
            rating: void 0
          }));
        }
      }
    } catch (e) {
      console.warn("[MedicalService] Geoapify fallback failed:", e.message);
    }
  }
  return [
    {
      name: "City General Trauma & Emergency Hospital",
      address: "Emergency Medical Zone",
      lat: lat + 0.015,
      lng: lng + 0.012,
      phone: "112",
      rating: 4.6
    },
    {
      name: "District Multi-Specialty Medical Center",
      address: "Civil Hospital Road",
      lat: lat - 0.018,
      lng: lng + 0.015,
      phone: "112",
      rating: 4.4
    },
    {
      name: "Apex Critical Care & 24/7 Trauma Unit",
      address: "Metro Healthcare Hub",
      lat: lat + 0.022,
      lng: lng - 0.019,
      phone: "112",
      rating: 4.7
    }
  ];
}
function getLocalClinicalFallback(patient, reason, sensorSummary) {
  const text = `${reason} ${patient.conditions || ""}`.toLowerCase();
  const peakG = Number(sensorSummary?.peakG ?? 0);
  if (text.includes("chest") || text.includes("heart") || text.includes("cardiac") || text.includes("infarct")) {
    return {
      condition: "Suspected Acute Coronary / Cardiac Emergency",
      severity: "CRITICAL",
      possibleDiseasesOrInjuries: ["Acute Myocardial Infarction", "Angina Pectoris", "Cardiac Trauma"],
      firstAidInstructions: [
        "Keep patient in a comfortable seated position with head and shoulders supported.",
        "Loosen all tight clothing around neck and chest.",
        "Monitor breathing and pulse continuously; begin CPR immediately if unresponsive.",
        "Keep patient calm and avoid any physical exertion."
      ],
      specialtiesNeeded: ["Cardiology", "Cath Lab", "Cardiac ICU", "Emergency Medicine"],
      triageSummary: "Urgent suspected cardiac distress. Immediate ECG, oxygenation, and cardiology team readiness required."
    };
  }
  if (text.includes("breath") || text.includes("asthma") || text.includes("chok") || text.includes("suffocat")) {
    return {
      condition: "Suspected Acute Respiratory Distress / Airway Compromise",
      severity: "CRITICAL",
      possibleDiseasesOrInjuries: ["Severe Asthma Exacerbation", "Pneumothorax", "Airway Obstruction"],
      firstAidInstructions: [
        "Position patient sitting upright to ease breathing.",
        "Ensure adequate ventilation and fresh airflow.",
        "Assist patient with their prescribed inhaler if conscious and available.",
        "Reassure the patient and do not crowd around them."
      ],
      specialtiesNeeded: ["Pulmonology", "Respiratory ICU", "Emergency Medicine"],
      triageSummary: "Severe respiratory distress with airway vulnerability. Immediate nebulization and oxygen therapy needed."
    };
  }
  if (peakG > 5 || text.includes("crash") || text.includes("impact") || text.includes("accident") || text.includes("head") || text.includes("fracture") || text.includes("bleed")) {
    return {
      condition: "High-Energy Blunt Trauma & Suspected Internal Injury",
      severity: peakG > 8 ? "CRITICAL" : "HIGH",
      possibleDiseasesOrInjuries: ["Traumatic Brain Injury / Concussion", "Internal Hemorrhage", "Spinal Trauma", "Bone Fractures"],
      firstAidInstructions: [
        "Do not move patient or manipulate neck/spine unless in immediate fire/environmental danger.",
        "Apply firm, continuous pressure with a sterile cloth to any active bleeding sites.",
        "Keep patient warm with a jacket/blanket to prevent hypothermic shock.",
        "Continuously monitor airway and responsiveness until paramedics arrive."
      ],
      specialtiesNeeded: ["Level-1 Trauma Care", "Orthopedic Surgery", "Neurosurgery", "Blood Transfusion Unit"],
      triageSummary: `High-energy road impact (${peakG > 0 ? `${peakG.toFixed(1)}G` : "severe impact"}). Surgical trauma triage and radiological imaging required upon arrival.`
    };
  }
  return {
    condition: "Emergency Distress & Acute Health Deterioration",
    severity: "HIGH",
    possibleDiseasesOrInjuries: ["Acute Trauma / Shock", "Syncopal Episode", "Systemic Decompensation"],
    firstAidInstructions: [
      "Ensure patient is in a safe location away from oncoming traffic.",
      "Check responsiveness, breathing, and pulse.",
      "Place patient in recovery position if unconscious but breathing normally.",
      "Comfort the patient and stay on the line with emergency services."
    ],
    specialtiesNeeded: ["24/7 Emergency Medicine", "Intensive Care Unit", "General Surgery"],
    triageSummary: "Emergency distress triggered by user voice activation. Full clinical vitals assessment and stabilization needed."
  };
}
async function analyzeMedicalConditionAndRecommendHospitals(params) {
  const { patient, reason, sensorSummary, location } = params;
  const lat = location?.lat ?? 12.9716;
  const lng = location?.lng ?? 77.5946;
  const rawHospitals = await fetchNearbyHospitals(lat, lng);
  const hospitalsWithDistance = rawHospitals.map((h) => ({
    ...h,
    distanceKm: calculateDistanceKm(lat, lng, h.lat, h.lng)
  })).sort((a, b) => a.distanceKm - b.distanceKm);
  let analysis;
  let recommendedHospitalName;
  let recommendationReason;
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new import_genai2.GoogleGenAI({ apiKey });
      const hospitalListStr = hospitalsWithDistance.slice(0, 5).map(
        (h, i) => `${i + 1}. "${h.name}" (${h.distanceKm} km away, Address: ${h.address}, Phone: ${h.phone || "N/A"}, Rating: ${h.rating ?? "N/A"})`
      ).join("\n");
      const retrievedContext = await retrieveContext(reason, "medical");
      const retrievedContextStr = retrievedContext.length > 0 ? "\nRETRIEVED KNOWLEDGE BASE CONTEXT:\n" + retrievedContext.map((r) => r.content).join("\n") + "\n" : "";
      const prompt = `You are an expert emergency medical physician and triage AI assisting the RoadSOS emergency response system.
Analyze the following patient profile, emergency distress event, and nearby hospitals:

PATIENT INFORMATION:
- Name: ${patient.name || "Unknown"}
- Blood Group: ${patient.bloodGroup || "Unknown"}
- Known Allergies: ${patient.allergies || "None"}
- Known Pre-existing Conditions / Medical History: ${patient.conditions || "None reported"}
- Distress Reason / Utterance: "${reason}"
- Sensor / Crash Telemetry: ${JSON.stringify(sensorSummary || {})}
- Patient Location: Latitude ${lat}, Longitude ${lng}
${retrievedContextStr}
NEARBY HOSPITALS (via Google Maps):
${hospitalListStr}

TASK:
1. Diagnose the suspected acute medical condition, potential diseases or injuries, and triage severity level.
2. Formulate immediate critical first aid instructions for on-scene bystanders or user. Ground your answer in the RETRIEVED KNOWLEDGE BASE CONTEXT if provided.
3. Determine required hospital specialties and facilities.
4. Select the best recommended hospital from the provided list based on distance and capability for the patient's condition.

You MUST respond strictly in valid JSON format with NO markdown code blocks (no \`\`\`json), conforming to this schema:
{
  "condition": "Concise primary condition/disease assessment (e.g. Acute Traumatic Hemorrhage & Shock, Cardiac Event, Traumatic Brain Injury, Respiratory Distress)",
  "severity": "CRITICAL" | "HIGH" | "MODERATE" | "MILD",
  "possibleDiseasesOrInjuries": ["Disease/Injury 1", "Disease/Injury 2"],
  "firstAidInstructions": [
    "Clear actionable step 1",
    "Clear actionable step 2",
    "Clear actionable step 3"
  ],
  "specialtiesNeeded": ["Trauma ICU", "Specialty 2"],
  "triageSummary": "Short 1-2 sentence clinical summary for hospital triage team",
  "recommendedHospitalName": "Exact name of best recommended hospital from the list",
  "recommendationReason": "Why this hospital is best suited for the patient's condition (including distance advantage)",
  "confidence": 0.0 to 1.0,
  "groundedInRetrievedContext": boolean
}`;
      const response = await ai.models.generateContent({
        model: AI_TIERS.emergencyMedical.model,
        contents: prompt,
        config: {
          temperature: AI_TIERS.emergencyMedical.temperature,
          maxOutputTokens: AI_TIERS.emergencyMedical.maxOutputTokens,
          responseMimeType: "application/json"
        }
      });
      const responseText = response.text || "";
      const cleanedJsonStr = responseText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanedJsonStr);
      const confidence = parsed.confidence ?? 1;
      const grounded = parsed.groundedInRetrievedContext ?? true;
      let instructions = Array.isArray(parsed.firstAidInstructions) ? parsed.firstAidInstructions : [];
      if (confidence < MEDICAL_CONFIDENCE_THRESHOLD || !grounded) {
        console.warn(`[MedicalService] Low confidence (${confidence}, threshold: ${MEDICAL_CONFIDENCE_THRESHOLD}) or ungrounded (${grounded}). Appending disclaimer.`);
        instructions.push("PLEASE NOTE: Please also contact a medical professional / emergency services for definitive guidance.");
      }
      analysis = {
        condition: parsed.condition || "Acute Emergency Distress",
        severity: ["CRITICAL", "HIGH", "MODERATE", "MILD"].includes(parsed.severity) ? parsed.severity : "HIGH",
        possibleDiseasesOrInjuries: Array.isArray(parsed.possibleDiseasesOrInjuries) ? parsed.possibleDiseasesOrInjuries : [],
        firstAidInstructions: instructions,
        specialtiesNeeded: Array.isArray(parsed.specialtiesNeeded) ? parsed.specialtiesNeeded : [],
        triageSummary: parsed.triageSummary || "Emergency triage initiated. Immediate vitals assessment recommended.",
        confidence,
        groundedInRetrievedContext: grounded
      };
      recommendedHospitalName = parsed.recommendedHospitalName;
      recommendationReason = parsed.recommendationReason;
    } catch (err) {
      console.warn("[MedicalService] Gemini API analysis failed or threw, using clinical fallback:", err.message);
      analysis = getLocalClinicalFallback(patient, reason, sensorSummary);
    }
  } else {
    analysis = getLocalClinicalFallback(patient, reason, sensorSummary);
  }
  const recommendedHospitals = hospitalsWithDistance.slice(0, 5).map((h, idx) => {
    const isPrimary = recommendedHospitalName ? h.name.toLowerCase().includes(recommendedHospitalName.toLowerCase()) || recommendedHospitalName.toLowerCase().includes(h.name.toLowerCase()) : idx === 0;
    const defaultReason = idx === 0 ? `Nearest 24/7 Emergency Hospital (${h.distanceKm} km) equipped for acute stabilization` : `${h.distanceKm} km away with emergency medical support`;
    return {
      name: h.name,
      address: h.address,
      distanceKm: h.distanceKm,
      phone: h.phone,
      lat: h.lat,
      lng: h.lng,
      rating: h.rating,
      userRatingCount: h.userRatingCount,
      recommendationReason: isPrimary && recommendationReason ? recommendationReason : defaultReason,
      mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`
    };
  });
  if (recommendedHospitalName) {
    const primaryIdx = recommendedHospitals.findIndex(
      (h) => h.name.toLowerCase().includes(recommendedHospitalName.toLowerCase()) || recommendedHospitalName.toLowerCase().includes(h.name.toLowerCase())
    );
    if (primaryIdx > 0) {
      const [primary] = recommendedHospitals.splice(primaryIdx, 1);
      recommendedHospitals.unshift(primary);
    }
  }
  return {
    analysis,
    recommendedHospitals,
    primaryHospital: recommendedHospitals[0] || null
  };
}

// api/incidents.ts
var TRANSITIONS = {
  DETECTED: ["PROBING", "DISPATCHED", "CANCELLED"],
  PROBING: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["ACKED", "CLOSED", "CANCELLED"],
  ACKED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: []
};
function canTransition(from, to) {
  return TRANSITIONS[from].includes(to);
}
var MemoryIncidentStore = class {
  items = /* @__PURE__ */ new Map();
  async get(id) {
    return this.items.get(id);
  }
  async save(incident) {
    this.items.set(incident.id, incident);
  }
  async saveEmergencyLog(incident) {
  }
  async findOpenByContact(phone) {
    const digits = normalizePhone(phone);
    return [...this.items.values()].filter((i) => i.state === "DISPATCHED" && i.contacts.some((c) => normalizePhone(c) === digits)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
};
var SupabaseMirroredStore = class extends MemoryIncidentStore {
  constructor(supabase4) {
    super();
    this.supabase = supabase4;
  }
  async get(id) {
    const local = await super.get(id);
    if (local) return local;
    const { data } = await this.supabase.from("incidents").select("payload").eq("id", id).maybeSingle();
    if (data?.payload) {
      const inc = data.payload;
      await super.save(inc);
      return inc;
    }
    return void 0;
  }
  async save(incident) {
    await super.save(incident);
    try {
      await this.supabase.from("incidents").upsert({
        id: incident.id,
        state: incident.state,
        kind: incident.kind,
        lat: incident.location?.lat ?? null,
        lng: incident.location?.lng ?? null,
        created_at: new Date(incident.createdAt).toISOString(),
        updated_at: new Date(incident.updatedAt).toISOString(),
        payload: incident
      });
    } catch (e) {
      console.warn("[Incidents] Supabase mirror failed:", e?.message);
    }
  }
  async saveEmergencyLog(incident) {
    try {
      const isDanger = incident.kind === "MANUAL_SOS" || incident.kind === "SAFETY_WORD";
      const condition_summary = incident.aiMedicalAnalysis ? `${incident.aiMedicalAnalysis.condition} [${incident.aiMedicalAnalysis.severity}]` : null;
      await this.supabase.from("emergency_logs").insert({
        incident_id: incident.id,
        device_token: incident.deviceToken,
        pathway: isDanger ? "danger" : "medical",
        trigger_reason: incident.reason,
        condition_summary,
        recipients: incident.contacts,
        location: incident.location,
        dispatch_status: {}
      });
    } catch (e) {
      console.warn("[Incidents] Supabase emergency_logs insert failed:", e?.message);
    }
  }
};
function normalizePhone(raw) {
  const trimmed = raw.replace(/[^\d+]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (/^0\d{10}$/.test(trimmed)) return `+91${trimmed.slice(1)}`;
  if (/^\d{10}$/.test(trimmed)) return `+91${trimmed}`;
  if (/^91\d{10}$/.test(trimmed)) return `+${trimmed}`;
  return `+${trimmed}`;
}
function isValidE164(p) {
  return /^\+[1-9]\d{7,14}$/.test(p);
}
var processSecret = null;
var secret = () => {
  const configured = process.env.INCIDENT_SIGNING_SECRET || process.env.JWT_SECRET;
  if (configured) return configured;
  if (!processSecret) {
    processSecret = import_crypto.default.randomBytes(32).toString("hex");
    console.warn(
      "[Incidents] INCIDENT_SIGNING_SECRET and JWT_SECRET are both unset. Generated a random in-memory signing secret for this process only \u2014 report links will stop validating after any restart or across multiple instances. Set INCIDENT_SIGNING_SECRET in production."
    );
  }
  return processSecret;
};
var signReportToken = (incidentId) => import_crypto.default.createHmac("sha256", secret()).update(incidentId).digest("hex").slice(0, 32);
var mapsLink = (loc) => loc ? `https://www.google.com/maps?q=${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}` : "location unavailable";
function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}`;
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var IncidentEngine = class {
  constructor(deps) {
    this.deps = deps;
  }
  idempotency = /* @__PURE__ */ new Map();
  now() {
    return this.deps.now ? this.deps.now() : Date.now();
  }
  emit(incident) {
    this.deps.io?.to(`incident:${incident.id}`).emit("incident:update", publicView(incident));
  }
  async transition(incident, to, note) {
    if (incident.state === to) return incident;
    if (!canTransition(incident.state, to)) {
      throw Object.assign(new Error(`Illegal transition ${incident.state} \u2192 ${to}`), { status: 409 });
    }
    incident.state = to;
    incident.updatedAt = this.now();
    incident.history.push({ state: to, at: incident.updatedAt, note });
    await this.deps.store.save(incident);
    this.emit(incident);
    return incident;
  }
  async create(input, idempotencyKey) {
    if (idempotencyKey && this.idempotency.has(idempotencyKey)) {
      const existing = await this.deps.store.get(this.idempotency.get(idempotencyKey));
      if (existing) return existing;
    }
    const id = import_crypto.default.randomUUID();
    const t = this.now();
    const incident = {
      ...input,
      id,
      state: input.kind === "CRASH" ? "PROBING" : "DETECTED",
      createdAt: t,
      updatedAt: t,
      deliveries: [],
      history: [{ state: input.kind === "CRASH" ? "PROBING" : "DETECTED", at: t }],
      reportToken: signReportToken(id)
    };
    await this.deps.store.save(incident);
    if (this.deps.drivingModeStore && input.deviceToken) {
      const reason = input.kind === "CRASH" ? "crash_detected" : input.kind === "SAFETY_WORD" ? "distress_word" : "manual_sos";
      this.deps.drivingModeStore.disable(input.deviceToken, reason).catch(() => {
      });
      this.deps.io?.to(`user:${input.deviceToken}`).emit("driving_mode:forced_off", { userId: input.deviceToken, active: false, reason });
      this.deps.io?.emit("driving_mode:forced_off", { userId: input.deviceToken, active: false, reason });
    }
    if (idempotencyKey) {
      this.idempotency.set(idempotencyKey, id);
      setTimeout(() => this.idempotency.delete(idempotencyKey), 10 * 60 * 1e3).unref?.();
    }
    return incident;
  }
  async cancel(incident, note = "Cancelled by user") {
    return this.transition(incident, "CANCELLED", note);
  }
  async close(incident) {
    return this.transition(incident, "CLOSED");
  }
  async acknowledge(incident, by, via) {
    if (incident.state === "ACKED" || incident.state === "CLOSED") return incident;
    incident.ack = { by, at: this.now(), via };
    await this.transition(incident, "ACKED", `Acknowledged by ${by} via ${via}`);
    return incident;
  }
  /**
   * Fan out SMS + voice call to every contact. Idempotent: calling twice on a
   * DISPATCHED incident returns the current delivery table without re-sending.
   */
  async dispatch(incident, baseUrl) {
    if (incident.state === "DISPATCHED" || incident.state === "ACKED") return incident;
    const isDangerPathway = incident.kind === "MANUAL_SOS" || incident.kind === "SAFETY_WORD";
    const isMedicalPathway = incident.kind === "VOICE_HELP" || incident.kind === "MEDICAL" || incident.kind === "CRASH";
    if (isDangerPathway) {
      const rawPoliceNumber = this.deps.policeNumber ?? process.env.POLICE_NUMBER;
      if (rawPoliceNumber) {
        const police = normalizePhone(rawPoliceNumber);
        if (police && isValidE164(police) && !incident.contacts.includes(police)) {
          incident.contacts.unshift(police);
        }
      } else {
        console.warn(`[IncidentEngine] POLICE_NUMBER is not configured; dispatching to personal emergency contacts only (incident ${incident.id}).`);
      }
    }
    if (isMedicalPathway) {
      const rawHospitalNumber = this.deps.hospitalNumber ?? process.env.HOSPITAL_NUMBER;
      if (rawHospitalNumber) {
        const hosp = normalizePhone(rawHospitalNumber);
        if (hosp && isValidE164(hosp) && !incident.contacts.includes(hosp)) {
          incident.contacts.unshift(hosp);
        }
      } else {
        console.warn(`[IncidentEngine] HOSPITAL_NUMBER is not configured; dispatching to personal emergency contacts only (incident ${incident.id}).`);
      }
    }
    if (!incident.aiMedicalAnalysis || !incident.recommendedHospitals) {
      try {
        const medResult = await analyzeMedicalConditionAndRecommendHospitals({
          patient: incident.patient,
          reason: incident.reason,
          sensorSummary: incident.sensorSummary,
          location: incident.location
        });
        if (!incident.aiMedicalAnalysis) incident.aiMedicalAnalysis = medResult.analysis;
        if (!incident.recommendedHospitals) incident.recommendedHospitals = medResult.recommendedHospitals;
        await this.deps.store.save(incident);
      } catch (e) {
        console.warn("[IncidentEngine] Pre-dispatch medical analysis failed:", e?.message);
      }
    }
    if (incident.contacts.length === 0) {
      throw Object.assign(new Error("NO_CONTACTS"), { status: 400 });
    }
    await this.deps.store.saveEmergencyLog(incident);
    await this.transition(incident, "DISPATCHED", `Dispatching to ${incident.contacts.length} contact(s)`);
    const smsBody = buildSmsBody(incident, baseUrl);
    const sayText = buildCallScript(incident);
    await Promise.allSettled(incident.contacts.map(async (to) => {
      const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
      await this.sendWithRetry(incident, "sms", to, async (client) => {
        const msg = await client.messages.create({
          to,
          from: this.deps.fromNumber,
          body: smsBody,
          ...isLocal ? {} : { statusCallback: `${baseUrl}/api/twilio/incidents/${incident.id}/status?channel=sms` }
        });
        return msg.sid;
      });
      await this.sendWithRetry(incident, "call", to, async (client) => {
        const gatherUrl = `${baseUrl}/api/twilio/incidents/${incident.id}/gather?to=${encodeURIComponent(to)}`;
        const twiml = new import_twilio.default.twiml.VoiceResponse();
        const gather = twiml.gather({ numDigits: 1, action: gatherUrl, method: "POST", timeout: 12 });
        gather.say({ loop: 2 }, sayText);
        twiml.say("No confirmation received. Goodbye.");
        const call = await client.calls.create({
          to,
          from: this.deps.fromNumber,
          twiml: twiml.toString(),
          ...isLocal ? {} : { statusCallback: `${baseUrl}/api/twilio/incidents/${incident.id}/status?channel=call` },
          statusCallbackEvent: ["initiated", "answered", "completed"]
        });
        return call.sid;
      });
    }));
    incident.updatedAt = this.now();
    await this.deps.store.save(incident);
    this.emit(incident);
    if (incident.deliveries.length > 0 && incident.deliveries.every((d) => d.status === "failed")) {
      console.error(`[IncidentEngine] FATAL: All dispatch channels failed for incident ${incident.id}`);
      if (this.deps.io) {
        this.deps.io.emit("incident:dispatch_failed", incident);
      }
      const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "dispatch_failed",
            incidentId: incident.id,
            reason: incident.deliveries[0]?.error || "Unknown"
          })
        }).catch((e) => console.warn("[OpsAlert] Failed to fire webhook:", e.message));
      }
    }
    return incident;
  }
  async sendWithRetry(incident, channel, to, fn) {
    const delivery = { id: import_crypto.default.randomUUID(), channel, to, status: "queued", attempts: 0, updatedAt: this.now() };
    incident.deliveries.push(delivery);
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      delivery.attempts = attempt;
      try {
        if (!this.deps.fromNumber) throw new Error("TWILIO_FROM_NUMBER is not configured");
        const client = this.deps.getTwilio();
        delivery.sid = await fn(client);
        delivery.status = "sent";
        delivery.error = void 0;
        delivery.updatedAt = this.now();
        await this.deps.store.save(incident);
        this.emit(incident);
        return;
      } catch (e) {
        const msg = e?.message || String(e);
        delivery.error = msg;
        delivery.updatedAt = this.now();
        const permanent = /Authenticate|credentials|unverified|Trial|not a valid phone|not configured|permission/i.test(msg);
        if (permanent || attempt === maxAttempts) {
          delivery.status = "failed";
          console.error(`[Incident ${incident.id}] ${channel} \u2192 ${to} FAILED (${attempt}/${maxAttempts}): ${msg}`);
          await this.deps.store.save(incident);
          this.emit(incident);
          return;
        }
        await sleep(600 * Math.pow(2, attempt - 1));
      }
    }
  }
  /** Twilio status callback → delivery row. */
  async updateDeliveryStatus(incident, channel, sid, rawStatus) {
    const d = incident.deliveries.find((x) => x.channel === channel && (sid ? x.sid === sid : true));
    if (!d) return;
    const s = rawStatus.toLowerCase();
    if (channel === "sms") {
      if (s === "delivered") d.status = "delivered";
      else if (s === "failed" || s === "undelivered") {
        d.status = "failed";
        d.error = `Carrier status: ${s}`;
      }
    } else {
      if (s === "in-progress" || s === "answered") d.status = "answered";
      else if (s === "completed") {
        if (d.status !== "answered") d.status = "no_answer";
      } else if (s === "no-answer" || s === "busy") d.status = "no_answer";
      else if (s === "failed" || s === "canceled") {
        d.status = "failed";
        d.error = `Call status: ${s}`;
      }
    }
    d.updatedAt = this.now();
    incident.updatedAt = d.updatedAt;
    await this.deps.store.save(incident);
    this.emit(incident);
  }
};
function buildSmsBody(incident, baseUrl) {
  const who = incident.patient.name?.trim() || incident.patient.phone || "A RoadSOS user";
  const kind = incident.kind === "CRASH" ? "possible road crash detected" : incident.kind === "SAFETY_WORD" ? "silent distress signal" : incident.kind === "MEDICAL" ? "medical emergency" : incident.kind === "VOICE_HELP" ? "urgent HELP distress signal" : "emergency";
  const conf = incident.confidence ? ` (${incident.confidence.toLowerCase()} confidence)` : "";
  const staticLoc = incident.address ? `${incident.address}
${mapsLink(incident.location)}` : mapsLink(incident.location);
  const liveTracking = `Live Tracking: ${baseUrl}/track/${incident.id}?t=${incident.reportToken}`;
  const reportUrl = `${baseUrl}/api/incidents/${incident.id}/report.pdf?t=${incident.reportToken}`;
  const med = [
    incident.patient.bloodGroup && `Blood: ${incident.patient.bloodGroup}`,
    incident.patient.allergies && `Allergies: ${incident.patient.allergies}`,
    incident.patient.conditions && `Conditions: ${incident.patient.conditions}`
  ].filter(Boolean).join(" | ");
  const aiCondition = incident.aiMedicalAnalysis ? `Assessment: ${incident.aiMedicalAnalysis.condition} [${incident.aiMedicalAnalysis.severity}]` : void 0;
  const nearestHosp = incident.recommendedHospitals && incident.recommendedHospitals.length > 0 ? `Recommended Hospital: ${incident.recommendedHospitals[0].name} (${incident.recommendedHospitals[0].distanceKm} km)` : void 0;
  return [
    `ROADSOS DISTRESS ALERT: ${who} \u2014 ${kind}${conf}.`,
    aiCondition,
    `Location (Static): ${staticLoc}`,
    liveTracking,
    med,
    nearestHosp,
    `Full report: ${reportUrl}`,
    `Reply ACK to confirm you are responding.`
  ].filter(Boolean).join("\n\n");
}
function buildCallScript(incident) {
  const who = incident.patient.name?.trim() || "a Road S O S user";
  const what = incident.kind === "CRASH" ? "may have been in a road accident and is not responding" : incident.kind === "SAFETY_WORD" ? "has sent a silent distress signal" : incident.kind === "VOICE_HELP" ? "has triggered emergency HELP distress" : "needs urgent help";
  const conditionStr = incident.aiMedicalAnalysis?.condition ? ` Preliminary condition: ${incident.aiMedicalAnalysis.condition}.` : "";
  const where = incident.address ? ` Location: ${incident.address}.` : incident.location ? ` Location and full medical report have been sent by S M S.` : "";
  return `Emergency alert from Road S O S. ${who} ${what}.${conditionStr}${where} Press 1 to confirm ambulance dispatch.`;
}
function publicView(i) {
  const { deviceToken, reportToken, ...rest } = i;
  return rest;
}
async function renderIncidentPdf(incident) {
  const qr = await import_qrcode.default.toBuffer(mapsLink(incident.location), { width: 220, margin: 1 });
  return new Promise((resolve, reject) => {
    const doc = new import_pdfkit.default({ size: "A4", margin: 48 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(22).text("RoadSOS Incident Handover", { align: "left" });
    doc.fontSize(10).fillColor("#555").text(`Incident ${incident.id}`).text(`Generated ${(/* @__PURE__ */ new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
    doc.moveDown().fillColor("#000");
    doc.fontSize(14).text("Patient");
    doc.fontSize(11).text(`Name: ${incident.patient.name || "Unknown"}`).text(`Phone: ${incident.patient.phone || "Unknown"}`).text(`Blood group: ${incident.patient.bloodGroup || "Unknown"}`).text(`Allergies: ${incident.patient.allergies || "None recorded"}`).text(`Conditions: ${incident.patient.conditions || "None recorded"}`);
    doc.moveDown();
    doc.fontSize(14).text("Incident");
    doc.fontSize(11).text(`Type: ${incident.kind}${incident.confidence ? ` \u2014 ${incident.confidence} confidence` : ""}`).text(`Reason: ${incident.reason}`).text(`Time: ${new Date(incident.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`).text(`Location: ${incident.address || "\u2014"}`).text(incident.location ? `Coordinates: ${incident.location.lat.toFixed(6)}, ${incident.location.lng.toFixed(6)}` : "Coordinates: unavailable");
    if (incident.sensorSummary) {
      doc.moveDown(0.5).fontSize(12).text("Sensor snapshot");
      doc.fontSize(10);
      for (const [k, v] of Object.entries(incident.sensorSummary)) doc.text(`${k}: ${v}`);
    }
    const y = doc.y;
    doc.image(qr, 380, 120, { width: 160 });
    doc.fontSize(8).fillColor("#555").text("Scan for live map location", 380, 284, { width: 160, align: "center" }).fillColor("#000");
    doc.y = Math.max(y, 300);
    doc.moveDown();
    if (incident.aiMedicalAnalysis) {
      doc.fontSize(13).fillColor("#b91c1c").text("AI Clinical & Disease Analysis (Gemini)", { underline: true });
      doc.fontSize(10).fillColor("#000");
      doc.text(`Primary Condition: ${incident.aiMedicalAnalysis.condition}  [Severity: ${incident.aiMedicalAnalysis.severity}]`);
      if (incident.aiMedicalAnalysis.possibleDiseasesOrInjuries?.length) {
        doc.text(`Potential Diseases/Injuries: ${incident.aiMedicalAnalysis.possibleDiseasesOrInjuries.join(", ")}`);
      }
      if (incident.aiMedicalAnalysis.specialtiesNeeded?.length) {
        doc.text(`Recommended Facilities: ${incident.aiMedicalAnalysis.specialtiesNeeded.join(", ")}`);
      }
      if (incident.aiMedicalAnalysis.triageSummary) {
        doc.text(`Triage Summary: ${incident.aiMedicalAnalysis.triageSummary}`);
      }
      if (incident.aiMedicalAnalysis.firstAidInstructions?.length) {
        doc.moveDown(0.2).fontSize(9).fillColor("#1d4ed8").text("Immediate First Aid Protocols:");
        doc.fontSize(9).fillColor("#333");
        incident.aiMedicalAnalysis.firstAidInstructions.forEach((step) => {
          doc.text(`  \u2022 ${step}`);
        });
      }
      doc.moveDown(0.5).fillColor("#000");
    }
    if (incident.recommendedHospitals && incident.recommendedHospitals.length > 0) {
      doc.fontSize(13).fillColor("#1e40af").text("Recommended Nearby Hospitals (Google Maps)", { underline: true });
      doc.fontSize(10).fillColor("#000");
      incident.recommendedHospitals.slice(0, 3).forEach((h, idx) => {
        doc.text(`${idx + 1}. ${h.name} \u2014 ${h.distanceKm} km away \u2014 Phone: ${h.phone || "Emergency Line"}`);
        if (h.recommendationReason) doc.fontSize(8).fillColor("#555").text(`    Reason: ${h.recommendationReason}`).fillColor("#000").fontSize(10);
        if (h.address) doc.fontSize(8).fillColor("#777").text(`    Address: ${h.address}`).fillColor("#000").fontSize(10);
      });
      doc.moveDown(0.5);
    }
    doc.fontSize(14).text("Notification log");
    doc.fontSize(10);
    for (const h of incident.history) doc.text(`${new Date(h.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}  ${h.state}${h.note ? ` \u2014 ${h.note}` : ""}`);
    for (const d of incident.deliveries) doc.text(`${new Date(d.updatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}  ${d.channel.toUpperCase()} \u2192 ${d.to}: ${d.status}${d.error ? ` (${d.error})` : ""}`);
    doc.end();
  });
}
var createSchema = import_zod.z.object({
  kind: import_zod.z.enum(["CRASH", "MANUAL_SOS", "SAFETY_WORD", "VOICE_HELP", "MEDICAL"]),
  reason: import_zod.z.string().min(1).max(300),
  location: import_zod.z.object({ lat: import_zod.z.number().min(-90).max(90), lng: import_zod.z.number().min(-180).max(180), accuracyM: import_zod.z.number().optional() }).optional(),
  address: import_zod.z.string().max(300).optional(),
  confidence: import_zod.z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  sensorSummary: import_zod.z.record(import_zod.z.string(), import_zod.z.union([import_zod.z.number(), import_zod.z.string(), import_zod.z.boolean()])).optional(),
  patient: import_zod.z.object({
    name: import_zod.z.string().max(80).default(""),
    phone: import_zod.z.string().max(20).optional(),
    bloodGroup: import_zod.z.string().max(10).optional(),
    allergies: import_zod.z.string().max(200).optional(),
    conditions: import_zod.z.string().max(200).optional()
  }),
  contacts: import_zod.z.array(import_zod.z.string().min(7).max(20)).max(10),
  aiMedicalAnalysis: import_zod.z.any().optional(),
  recommendedHospitals: import_zod.z.any().optional()
});
function createIncidentRouter(engine, store, io2) {
  const router2 = import_express.default.Router();
  const validateWebhooks = process.env.TWILIO_VALIDATE_WEBHOOKS ? process.env.TWILIO_VALIDATE_WEBHOOKS === "true" : process.env.NODE_ENV === "production";
  const twilioGuard = import_twilio.default.webhook({
    validate: validateWebhooks,
    ...process.env.PUBLIC_BASE_URL ? { protocol: new URL(process.env.PUBLIC_BASE_URL).protocol.replace(":", ""), host: new URL(process.env.PUBLIC_BASE_URL).host } : {}
  });
  const requireOwner = async (req, res, next) => {
    const incident = await store.get(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    const token = req.header("x-device-token");
    if (!token || token !== incident.deviceToken) return res.status(403).json({ error: "Not the owning device" });
    req.incident = incident;
    next();
  };
  router2.post("/api/incidents", async (req, res) => {
    try {
      const deviceToken = req.header("x-device-token");
      if (!deviceToken || deviceToken.length < 16) return res.status(401).json({ error: "Missing device token" });
      const body = createSchema.parse(req.body);
      const contacts = [...new Set(body.contacts.map(normalizePhone))].filter(isValidE164);
      const incident = await engine.create({
        deviceToken,
        kind: body.kind,
        reason: (0, import_xss.default)(body.reason),
        location: body.location,
        address: body.address ? (0, import_xss.default)(body.address) : void 0,
        confidence: body.confidence,
        sensorSummary: body.sensorSummary,
        patient: {
          name: (0, import_xss.default)(body.patient.name),
          phone: body.patient.phone ? normalizePhone(body.patient.phone) : void 0,
          bloodGroup: body.patient.bloodGroup ? (0, import_xss.default)(body.patient.bloodGroup) : void 0,
          allergies: body.patient.allergies ? (0, import_xss.default)(body.patient.allergies) : void 0,
          conditions: body.patient.conditions ? (0, import_xss.default)(body.patient.conditions) : void 0
        },
        contacts,
        aiMedicalAnalysis: body.aiMedicalAnalysis,
        recommendedHospitals: body.recommendedHospitals
      }, req.header("idempotency-key") || void 0);
      res.status(201).json({ incident: publicView(incident), warnings: contacts.length === 0 ? ["NO_VALID_CONTACTS"] : [] });
    } catch (e) {
      if (e instanceof import_zod.z.ZodError) return res.status(400).json({ error: "Invalid input", issues: e.issues });
      res.status(e.status || 500).json({ error: e.message });
    }
  });
  router2.get("/api/incidents/:id", async (req, res) => {
    const incident = await store.get(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    const token = req.header("x-device-token");
    if (token !== incident.deviceToken) return res.status(403).json({ error: "Not the owning device" });
    res.json({ incident: publicView(incident) });
  });
  router2.post("/api/incidents/:id/dispatch", requireOwner, async (req, res) => {
    const incident = req.incident;
    try {
      await engine.dispatch(incident, publicBaseUrl(req));
      const sent = incident.deliveries.filter((d) => d.status !== "failed").length;
      res.json({
        incident: publicView(incident),
        summary: { total: incident.deliveries.length, sent, failed: incident.deliveries.length - sent, allFailed: incident.deliveries.length > 0 && sent === 0 }
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message, incident: publicView(incident) });
    }
  });
  router2.post("/api/incidents/:id/cancel", requireOwner, async (req, res) => {
    try {
      res.json({ incident: publicView(await engine.cancel(req.incident, (0, import_xss.default)(req.body?.note || "Cancelled by user"))) });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
  router2.post("/api/incidents/:id/close", requireOwner, async (req, res) => {
    try {
      res.json({ incident: publicView(await engine.close(req.incident)) });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
  router2.post("/api/incidents/:id/location", requireOwner, async (req, res) => {
    const incident = req.incident;
    try {
      const body = import_zod.z.object({
        lat: import_zod.z.number().min(-90).max(90),
        lng: import_zod.z.number().min(-180).max(180),
        accuracyM: import_zod.z.number().optional(),
        speedMps: import_zod.z.number().optional()
      }).parse(req.body);
      incident.location = { lat: body.lat, lng: body.lng, accuracyM: body.accuracyM };
      if (!incident.locationHistory) incident.locationHistory = [];
      incident.locationHistory.push({ lat: body.lat, lng: body.lng, accuracyM: body.accuracyM, speedMps: body.speedMps, at: Date.now() });
      incident.updatedAt = Date.now();
      await store.save(incident);
      io2?.emit("incident:update", publicView(incident));
      io2?.to(`incident:${incident.id}`).emit("incident:update", publicView(incident));
      res.json({ status: "ok" });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  router2.get("/api/incidents/:id/report.pdf", async (req, res) => {
    const incident = await store.get(req.params.id);
    if (!incident) return res.status(404).send("Report not found");
    const t = String(req.query.t || "");
    const ok = t.length === incident.reportToken.length && import_crypto.default.timingSafeEqual(Buffer.from(t), Buffer.from(incident.reportToken));
    if (!ok) return res.status(403).send("Invalid report link");
    if ((incident.state === "CLOSED" || incident.state === "CANCELLED") && Date.now() - incident.updatedAt > 24 * 3600 * 1e3) {
      return res.status(410).send("Report expired");
    }
    try {
      const pdf = await renderIncidentPdf(incident);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store");
      res.send(pdf);
    } catch (e) {
      res.status(500).send("Could not render report");
    }
  });
  router2.post("/api/twilio/incidents/:id/gather", twilioGuard, async (req, res) => {
    const twiml = new import_twilio.default.twiml.VoiceResponse();
    const incident = await store.get(req.params.id);
    const digits = String(req.body?.Digits || "");
    const to = String(req.query.to || req.body?.To || "responder");
    if (incident && digits === "1") {
      await engine.acknowledge(incident, to, "call_keypress");
      twiml.say("Thank you. The person has been told that you are responding. Goodbye.");
    } else {
      twiml.say("No confirmation recorded. Goodbye.");
    }
    twiml.hangup();
    res.type("text/xml").send(twiml.toString());
  });
  router2.post("/api/twilio/incidents/:id/status", twilioGuard, async (req, res) => {
    const incident = await store.get(req.params.id);
    if (incident) {
      const channel = req.query.channel === "call" ? "call" : "sms";
      const sid = req.body?.MessageSid || req.body?.CallSid;
      const status = req.body?.MessageStatus || req.body?.CallStatus || "";
      await engine.updateDeliveryStatus(incident, channel, sid, status);
    }
    res.sendStatus(204);
  });
  router2.post("/api/twilio/sms", twilioGuard, async (req, res) => {
    const body = String(req.body?.Body || "").toLowerCase().trim();
    const from = String(req.body?.From || "");
    const twiml = new import_twilio.default.twiml.MessagingResponse();
    const confirms = body === "1" || /\b(yes|ok|okay|confirm|coming|on my way|en route|responding|ack)\b/.test(body);
    const incident = from ? await store.findOpenByContact(from) : void 0;
    if (incident && confirms) {
      await engine.acknowledge(incident, from, "sms_reply");
      twiml.message("RoadSOS: Thank you. The person has been told you are responding.");
    } else if (incident) {
      twiml.message("RoadSOS: Reply 1 to confirm you are responding to this emergency.");
    } else {
      twiml.message("RoadSOS: No active emergency is linked to this number.");
    }
    res.type("text/xml").send(twiml.toString());
  });
  io2?.on("connection", (socket) => {
    socket.on("incident:join", (incidentId) => {
      if (typeof incidentId === "string" && incidentId.length < 64) socket.join(`incident:${incidentId}`);
    });
    socket.on("incident:leave", (incidentId) => {
      if (typeof incidentId === "string") socket.leave(`incident:${incidentId}`);
    });
  });
  return router2;
}

// api/drivingMode.ts
var import_express2 = __toESM(require("express"), 1);
var import_jsonwebtoken = __toESM(require("jsonwebtoken"), 1);
var import_zod2 = require("zod");
var import_xss2 = __toESM(require("xss"), 1);
var import_twilio2 = __toESM(require("twilio"), 1);
var MemoryDrivingModeStore = class {
  states = /* @__PURE__ */ new Map();
  mostRecentUserId = null;
  async get(userId) {
    return this.states.get(userId) || null;
  }
  async getByPhone(phone) {
    const clean = phone.replace(/\D/g, "");
    if (!clean) return null;
    for (const state of this.states.values()) {
      const stateClean = state.phone.replace(/\D/g, "");
      if (stateClean && (stateClean.endsWith(clean) || clean.endsWith(stateClean))) {
        return state;
      }
    }
    return null;
  }
  async set(state) {
    this.states.set(state.userId, { ...state });
    this.mostRecentUserId = state.userId;
  }
  async disable(userId, reason) {
    const existing = this.states.get(userId);
    if (!existing) return null;
    const updated = {
      ...existing,
      isDrivingModeActive: false,
      updatedAt: Date.now()
    };
    this.states.set(userId, updated);
    this.mostRecentUserId = userId;
    return updated;
  }
  async getMostRecent() {
    if (!this.mostRecentUserId) {
      const first = this.states.values().next().value;
      return first || null;
    }
    return this.states.get(this.mostRecentUserId) || null;
  }
  async clear() {
    this.states.clear();
    this.mostRecentUserId = null;
  }
};
var SupabaseMirroredDrivingModeStore = class {
  constructor(supabase4) {
    this.supabase = supabase4;
  }
  memory = new MemoryDrivingModeStore();
  async get(userId) {
    const cached = await this.memory.get(userId);
    if (cached) return cached;
    try {
      const { data, error } = await this.supabase.from("driving_mode_status").select("*").eq("user_id", userId).single();
      if (!error && data) {
        const state = {
          userId: data.user_id,
          userName: data.user_name || void 0,
          phone: data.phone || "",
          isDrivingModeActive: !!data.is_active,
          updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now()
        };
        await this.memory.set(state);
        return state;
      }
    } catch {
    }
    return null;
  }
  async getByPhone(phone) {
    return this.memory.getByPhone(phone);
  }
  async set(state) {
    await this.memory.set(state);
    try {
      await this.supabase.from("driving_mode_status").upsert({
        user_id: state.userId,
        user_name: state.userName || null,
        phone: state.phone,
        is_active: state.isDrivingModeActive,
        updated_at: new Date(state.updatedAt).toISOString()
      });
    } catch {
    }
  }
  async disable(userId, reason) {
    const updated = await this.memory.disable(userId, reason);
    if (updated) {
      try {
        await this.supabase.from("driving_mode_status").upsert({
          user_id: updated.userId,
          user_name: updated.userName || null,
          phone: updated.phone,
          is_active: false,
          updated_at: new Date(updated.updatedAt).toISOString()
        });
      } catch {
      }
    }
    return updated;
  }
  async getMostRecent() {
    return this.memory.getMostRecent();
  }
  async clear() {
    await this.memory.clear();
  }
};
function createDrivingRouter(deps) {
  const router2 = import_express2.default.Router();
  const { store, io: io2 } = deps;
  const getSecret = () => deps.jwtSecret || process.env.JWT_SECRET || "fallback-secret";
  const authenticateDriving = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    const cookieToken = req.cookies?.token;
    const token = bearerToken || cookieToken;
    if (token) {
      import_jsonwebtoken.default.verify(token, getSecret(), (err, decoded) => {
        if (err) return res.status(403).json({ error: "Access denied: Invalid or expired session" });
        req.user = decoded;
        req.authUserId = decoded.id || decoded.sub;
        next();
      });
      return;
    }
    const deviceToken = req.header("x-device-token");
    if (deviceToken && deviceToken.length >= 16) {
      req.authUserId = deviceToken;
      next();
      return;
    }
    return res.status(401).json({ error: "Access denied: Valid authentication or device token required" });
  };
  const statusSchema = import_zod2.z.object({
    active: import_zod2.z.boolean().optional(),
    phone: import_zod2.z.string().optional(),
    name: import_zod2.z.string().optional(),
    reason: import_zod2.z.enum(["crash_detected", "manual_sos", "distress_word", "emergency_confirmed"]).optional()
  });
  router2.post("/api/status/driving", authenticateDriving, async (req, res) => {
    try {
      const body = statusSchema.parse(req.body);
      const userId = req.authUserId;
      const existing = await store.get(userId);
      const isDrivingModeActive = typeof body.active === "boolean" ? body.active : existing ? existing.isDrivingModeActive : false;
      const nextState = {
        userId,
        userName: body.name ? (0, import_xss2.default)(body.name) : req.user?.name || existing?.userName || "",
        phone: body.phone ? (0, import_xss2.default)(body.phone) : existing?.phone || "",
        isDrivingModeActive,
        updatedAt: Date.now()
      };
      await store.set(nextState);
      if (!isDrivingModeActive && body.reason) {
        io2?.to(`user:${userId}`).emit("driving_mode:forced_off", { userId, active: false, reason: body.reason });
        io2?.emit("driving_mode:forced_off", { userId, active: false, reason: body.reason });
      }
      io2?.to(`user:${userId}`).emit("driving_mode:changed", {
        userId,
        active: isDrivingModeActive,
        userName: nextState.userName,
        phone: nextState.phone
      });
      io2?.emit("driving_mode:changed", {
        userId,
        active: isDrivingModeActive,
        userName: nextState.userName,
        phone: nextState.phone
      });
      res.json({
        success: true,
        isDrivingModeActive: nextState.isDrivingModeActive,
        userId: nextState.userId
      });
    } catch (err) {
      if (err instanceof import_zod2.z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.issues });
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  router2.get("/api/status/driving", authenticateDriving, async (req, res) => {
    const userId = req.authUserId;
    const state = await store.get(userId);
    res.json({
      success: true,
      state: state || { userId, isDrivingModeActive: false, phone: "", updatedAt: 0 }
    });
  });
  const validateWebhooks = process.env.TWILIO_VALIDATE_WEBHOOKS ? process.env.TWILIO_VALIDATE_WEBHOOKS === "true" : process.env.NODE_ENV === "production";
  const twilioGuard = import_twilio2.default.webhook({
    validate: validateWebhooks,
    ...process.env.PUBLIC_BASE_URL ? {
      protocol: new URL(process.env.PUBLIC_BASE_URL).protocol.replace(":", ""),
      host: new URL(process.env.PUBLIC_BASE_URL).host
    } : {}
  });
  router2.post("/api/twilio/voice", twilioGuard, async (req, res) => {
    const twiml = new import_twilio2.default.twiml.VoiceResponse();
    const queryUserId = req.query.userId;
    const toPhone = req.body?.To;
    const fromPhone = req.body?.From;
    let state = null;
    if (queryUserId) {
      state = await store.get(queryUserId);
    }
    if (!state && toPhone) {
      state = await store.getByPhone(toPhone);
    }
    if (!state && fromPhone) {
      state = await store.getByPhone(fromPhone);
    }
    if (!state) {
      state = await store.getMostRecent();
    }
    const driverName = state?.userName && state.userName.trim().length > 0 ? state.userName.trim() : "The driver";
    if (state?.isDrivingModeActive) {
      twiml.say(`${driverName} is currently driving and will call you back.`);
      twiml.hangup();
    } else if (state?.phone) {
      twiml.say(`Connecting you to ${driverName}.`);
      twiml.dial(state.phone);
    } else {
      twiml.say(`${driverName} is not available right now. Please try again later.`);
      twiml.hangup();
    }
    res.type("text/xml");
    res.send(twiml.toString());
  });
  io2?.on("connection", (socket) => {
    socket.on("user:join", (userId) => {
      if (typeof userId === "string" && userId.length < 128) {
        socket.join(`user:${userId}`);
      }
    });
    socket.on("user:leave", (userId) => {
      if (typeof userId === "string") {
        socket.leave(`user:${userId}`);
      }
    });
  });
  return router2;
}

// api/traffic.ts
var import_express3 = __toESM(require("express"), 1);
var import_zod3 = require("zod");
var import_crypto2 = __toESM(require("crypto"), 1);
var import_xss3 = __toESM(require("xss"), 1);
var ProbeSchema = import_zod3.z.object({
  lat: import_zod3.z.number().min(-90).max(90),
  lng: import_zod3.z.number().min(-180).max(180),
  speedKmh: import_zod3.z.number(),
  headingDeg: import_zod3.z.number().optional(),
  timestamp: import_zod3.z.number(),
  sessionId: import_zod3.z.string().min(1)
});
var ReportSchema = import_zod3.z.object({
  type: import_zod3.z.enum(["pothole", "accident", "police", "waterlogging", "roadblock"]),
  lat: import_zod3.z.number().min(-90).max(90),
  lng: import_zod3.z.number().min(-180).max(180),
  sessionId: import_zod3.z.string().min(1)
});
var DEFAULT_FREEFLOW_SPEEDS = {
  motorway: 80,
  trunk: 60,
  primary: 50,
  secondary: 40,
  tertiary: 35,
  residential: 25,
  unclassified: 30
};
var segmentAggregates = /* @__PURE__ */ new Map();
var getGeoRoom = (lat, lng) => `geo:${Math.floor(lat * 10)}:${Math.floor(lng * 10)}`;
var hashSession = (s) => import_crypto2.default.createHash("sha256").update(s).digest("hex").slice(0, 16);
function classifyCongestion(avgSpeed, freeFlow) {
  const ratio = avgSpeed / freeFlow;
  if (ratio >= 0.75) return "Low";
  if (ratio >= 0.4) return "Moderate";
  return "High";
}
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function fetchOverpassIncidents(lat, lng, radiusM) {
  const query = `[out:json][timeout:15];(
    node["highway"="speed_camera"](around:${radiusM},${lat},${lng});
    node["hazard"](around:${radiusM},${lat},${lng});
    node["amenity"="police"](around:${radiusM},${lat},${lng});
    node["traffic_calming"](around:${radiusM},${lat},${lng});
    way["highway"="construction"](around:${radiusM},${lat},${lng});
    node["barrier"="toll_booth"](around:${radiusM},${lat},${lng});
    node["flood_prone"="yes"](around:${radiusM},${lat},${lng});
    way["surface"="unpaved"](around:${radiusM},${lat},${lng});
  );out center;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query),
      signal: AbortSignal.timeout(1e4)
    });
    const data = await res.json();
    return (data.elements || []).map((el) => {
      const t = el.tags || {};
      let label = "Unknown Hazard";
      let type = "info";
      if (t.highway === "speed_camera") {
        label = "\u{1F4F7} Speed Camera";
        type = "warning";
      } else if (t.amenity === "police") {
        label = "\u{1F46E} Police Post";
        type = "warning";
      } else if (t.hazard) {
        label = `\u26A0\uFE0F Hazard: ${t.hazard}`;
        type = "danger";
      } else if (t.highway === "construction") {
        label = "\u{1F6A7} Road Work";
        type = "warning";
      } else if (t.barrier === "toll_booth") {
        label = "\u{1F4B3} Toll Booth";
        type = "info";
      } else if (t.flood_prone === "yes") {
        label = "\u{1F30A} Flood Prone";
        type = "danger";
      } else if (t.surface === "unpaved") {
        label = "\u{1FAA8} Unpaved Road";
        type = "info";
      } else if (t.traffic_calming) {
        label = `\u{1F534} Speed Bump (${t.traffic_calming})`;
        type = "info";
      }
      const elLat = el.lat || el.center?.lat;
      const elLng = el.lon || el.center?.lon;
      return {
        label,
        type,
        source: "static",
        lat: elLat || null,
        lng: elLng || null,
        distKm: elLat && elLng ? haversineKm(lat, lng, elLat, elLng).toFixed(1) : null,
        name: t.name || t["name:en"] || null
      };
    });
  } catch (e) {
    console.error("[Traffic] Overpass error:", e);
    return [];
  }
}
function createTrafficRouter({ supabase: supabase4, io: io2 }) {
  const router2 = import_express3.default.Router();
  const OSRM_URL = process.env.OSRM_URL || "http://localhost:5000";
  if (io2) {
    io2.on("connection", (socket) => {
      socket.on("traffic:subscribe", ({ lat, lng }) => {
        socket.join(getGeoRoom(lat, lng));
      });
    });
  }
  setInterval(async () => {
    if (!supabase4) return;
    const now = Date.now();
    const WINDOW_MS = 5 * 60 * 1e3;
    const updates = [];
    for (const [wayId, agg] of segmentAggregates.entries()) {
      if (now - agg.windowStart > WINDOW_MS) {
        segmentAggregates.delete(wayId);
        continue;
      }
      if (agg.sampleCount === 0) continue;
      const avgSpeed = agg.sumSpeed / agg.sampleCount;
      const isLive = agg.sampleCount >= 3;
      const freeFlow = DEFAULT_FREEFLOW_SPEEDS["primary"] || 50;
      const congestion = classifyCongestion(avgSpeed, freeFlow);
      updates.push({
        way_id: wayId,
        avg_speed_kmh: Math.round(avgSpeed * 10) / 10,
        congestion_level: congestion,
        data_source: isLive ? "live" : "estimated",
        sample_count: agg.sampleCount,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      segmentAggregates.delete(wayId);
    }
    if (updates.length > 0) {
      const { error } = await supabase4.from("traffic_segments").upsert(updates, { onConflict: "way_id" });
      if (error) console.error("[Traffic] Flush error:", error);
      else if (io2) io2.emit("traffic:update", { type: "segments", data: updates });
    }
  }, 3e4);
  router2.get("/overview", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const radiusKm = parseFloat(req.query.radiusKm) || 2.5;
      if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: "Invalid lat/lng" });
      const [staticIncidents, crowdReports, segments] = await Promise.all([
        fetchOverpassIncidents(lat, lng, radiusKm * 1e3),
        supabase4 ? supabase4.from("reported_incidents").select("*").gt("expires_at", (/* @__PURE__ */ new Date()).toISOString()).then((r) => r.data || []) : Promise.resolve([]),
        supabase4 ? supabase4.from("traffic_segments").select("*").then((r) => r.data || []) : Promise.resolve([])
      ]);
      let routes = [];
      try {
        const probes = [
          { dlat: lat + 0.018, dlng: lng },
          { dlat: lat, dlng: lng + 0.022 },
          { dlat: lat - 0.018, dlng: lng }
        ];
        const routeResults = await Promise.allSettled(probes.map(async (p) => {
          const url = `${OSRM_URL}/route/v1/driving/${lng},${lat};${p.dlng},${p.dlat}?overview=false&steps=true`;
          const r = await fetch(url, { signal: AbortSignal.timeout(5e3) });
          const d = await r.json();
          const route = d.routes?.[0];
          if (!route) return null;
          const roadName = route.legs?.[0]?.steps?.[0]?.name || "Unnamed Road";
          const distKm = (route.distance / 1e3).toFixed(1);
          const durMin = Math.round(route.duration / 60);
          const speedKmh = Math.round(route.distance / 1e3 / ((route.duration || 1) / 3600));
          const freeFlow = DEFAULT_FREEFLOW_SPEEDS["primary"] || 50;
          const matchedSeg = segments.find((s) => s.way_id && s.avg_speed_kmh);
          const effectiveSpeed = matchedSeg ? matchedSeg.avg_speed_kmh : speedKmh;
          const congestion = classifyCongestion(effectiveSpeed, freeFlow);
          const dataSource = matchedSeg && matchedSeg.sample_count >= 3 ? "live" : "estimated";
          return { name: roadName, distKm, durMin, speedKmh: effectiveSpeed, congestion, dataSource };
        }));
        routes = routeResults.filter((r) => r.status === "fulfilled" && r.value !== null).map((r) => r.value);
      } catch (e) {
        console.warn("[Traffic] OSRM route error:", e);
      }
      if (routes.length === 0) {
        segments.forEach((s) => {
          if (s.way_id && s.way_id.startsWith("grid:")) {
            const parts = s.way_id.split(":");
            const cellLat = parseFloat(parts[1]);
            const cellLng = parseFloat(parts[2]);
            const dist = haversineKm(lat, lng, cellLat, cellLng);
            if (dist <= radiusKm) {
              const speed = s.avg_speed_kmh;
              routes.push({
                name: "Local Area (Live Data)",
                distKm: dist.toFixed(1),
                durMin: Math.round((dist || 0.1) / (speed || 1) * 60),
                speedKmh: speed,
                congestion: classifyCongestion(speed, 40),
                dataSource: "live"
              });
            }
          }
        });
      }
      const crowdIncidents = crowdReports.map((r) => ({
        id: r.id,
        label: `\u{1F6A8} ${r.type.charAt(0).toUpperCase() + r.type.slice(1)}`,
        type: r.type === "accident" ? "danger" : "warning",
        source: "crowd",
        lat: r.lat,
        lng: r.lng,
        distKm: haversineKm(lat, lng, r.lat, r.lng).toFixed(1),
        name: null,
        confirmCount: r.confirm_count
      }));
      const allIncidents = [...staticIncidents, ...crowdIncidents].sort((a, b) => parseFloat(a.distKm || "99") - parseFloat(b.distKm || "99"));
      const highRoutes = routes.filter((r) => r.congestion === "High").length;
      const modRoutes = routes.filter((r) => r.congestion === "Moderate").length;
      let congestionLevel = "Low";
      if (highRoutes >= 2 || allIncidents.filter((i) => i.source === "crowd").length >= 4) congestionLevel = "High";
      else if (modRoutes >= 1 || allIncidents.length >= 2) congestionLevel = "Moderate";
      res.json({
        congestionLevel,
        trafficPresent: congestionLevel !== "Low" || allIncidents.length > 0,
        incidents: allIncidents,
        routes,
        radius: `${radiusKm} km`,
        fetchedAt: (/* @__PURE__ */ new Date()).toLocaleTimeString()
      });
    } catch (err) {
      console.error("[Traffic] Overview error:", err);
      res.status(500).json({ error: "Traffic overview failed" });
    }
  });
  router2.post("/probe", async (req, res) => {
    try {
      const probe = ProbeSchema.parse(req.body);
      if (probe.speedKmh < 0 || probe.speedKmh > 200) return res.json({ status: "ignored" });
      let wayId = "unknown";
      try {
        const ts = Math.floor(probe.timestamp / 1e3);
        const matchRes = await fetch(
          `${OSRM_URL}/match/v1/driving/${probe.lng},${probe.lat}?timestamps=${ts}&radiuses=25`,
          { signal: AbortSignal.timeout(3e3) }
        );
        const matchData = await matchRes.json();
        if (matchData.matchings?.[0]?.legs?.[0]?.annotation?.nodes?.[0]) {
          wayId = matchData.matchings[0].legs[0].annotation.nodes[0].toString();
        }
      } catch {
      }
      if (wayId === "unknown") {
        wayId = `grid:${probe.lat.toFixed(3)}:${probe.lng.toFixed(3)}`;
      }
      const now = Date.now();
      let agg = segmentAggregates.get(wayId);
      if (!agg) {
        agg = { wayId, sumSpeed: 0, sampleCount: 0, windowStart: now, speeds: [] };
        segmentAggregates.set(wayId, agg);
      }
      if (agg.sampleCount > 2) {
        const mean = agg.sumSpeed / agg.sampleCount;
        const variance = agg.speeds.reduce((s, v) => s + (v - mean) ** 2, 0) / agg.sampleCount;
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0 && Math.abs(probe.speedKmh - mean) > 3 * stdDev) {
          return res.json({ status: "outlier" });
        }
      }
      agg.sumSpeed += probe.speedKmh;
      agg.sampleCount++;
      agg.speeds.push(probe.speedKmh);
      if (agg.speeds.length > 50) agg.speeds.shift();
      res.json({ status: "ok" });
    } catch {
      res.status(400).json({ error: "Invalid probe" });
    }
  });
  router2.post("/report", async (req, res) => {
    try {
      const report = ReportSchema.parse(req.body);
      if (!supabase4) return res.status(503).json({ error: "DB unavailable" });
      const { data, error } = await supabase4.from("reported_incidents").insert({
        type: (0, import_xss3.default)(report.type),
        lat: report.lat,
        lng: report.lng,
        reported_by: hashSession(report.sessionId),
        expires_at: new Date(Date.now() + 90 * 60 * 1e3).toISOString()
      }).select().single();
      if (error) throw error;
      if (io2) io2.to(getGeoRoom(report.lat, report.lng)).emit("traffic:update", { type: "new_report", data });
      res.status(201).json(data);
    } catch {
      res.status(400).json({ error: "Invalid report" });
    }
  });
  router2.post("/report/:id/confirm", async (req, res) => {
    try {
      if (!supabase4) return res.status(503).json({ error: "DB unavailable" });
      const { data: inc } = await supabase4.from("reported_incidents").select("*").eq("id", req.params.id).single();
      if (!inc) return res.status(404).json({ error: "Not found" });
      const maxExpiry = new Date(inc.created_at).getTime() + 4 * 60 * 60 * 1e3;
      const newExpiry = Math.min(new Date(inc.expires_at).getTime() + 30 * 60 * 1e3, maxExpiry);
      const { data: updated, error } = await supabase4.from("reported_incidents").update({ confirm_count: inc.confirm_count + 1, expires_at: new Date(newExpiry).toISOString() }).eq("id", req.params.id).select().single();
      if (error) throw error;
      if (io2) io2.to(getGeoRoom(inc.lat, inc.lng)).emit("traffic:update", { type: "confirmed", data: updated });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Confirm failed" });
    }
  });
  return router2;
}

// api/index.ts
var import_express_rate_limit2 = __toESM(require("express-rate-limit"), 1);
var import_google_genai = require("@langchain/google-genai");
var import_prompts = require("@langchain/core/prompts");
var import_runnables = require("@langchain/core/runnables");
var import_chat_history = require("@langchain/core/chat_history");
import_dotenv.default.config();
var app = (0, import_express5.default)();
var httpServer = (0, import_http.createServer)(app);
var socketAllowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()) : process.env.PUBLIC_BASE_URL ? [process.env.PUBLIC_BASE_URL] : process.env.NODE_ENV === "production" ? [] : "*";
var io = new import_socket.Server(httpServer, {
  cors: { origin: socketAllowedOrigins }
});
var PORT = 3e3;
app.use(import_express5.default.json());
app.use(import_express5.default.urlencoded({ extended: true }));
app.use((0, import_cookie_parser.default)());
app.set("trust proxy", 1);
app.use((0, import_helmet.default)({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginOpenerPolicy: false, crossOriginResourcePolicy: false, xFrameOptions: false }));
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
app.use("/api/", apiLimiter);
app.use("/api/ai/", aiLimiter);
app.io = io;
if (process.env.SUPABASE_URL && process.env.JWT_SECRET) {
  Promise.resolve().then(() => (init_auth(), auth_exports)).then(({ default: authRoutes }) => app.use("/api/auth", authRoutes)).catch((e) => console.error("[Auth] failed to mount:", e.message));
}
app.get("/api/health", (req, res) => {
  const expectedToken = process.env.HEALTH_PING_TOKEN;
  const providedToken = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (expectedToken && providedToken !== expectedToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({
    status: "ok",
    twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
    hospitalNumberConfigured: !!(process.env.HOSPITAL_NUMBER || process.env.Hospital_NUMBER),
    policeNumberConfigured: !!process.env.POLICE_NUMBER,
    gemini: !!process.env.GEMINI_API_KEY,
    supabase: !!process.env.SUPABASE_URL,
    maps: !!process.env.GOOGLE_MAPS_PLATFORM_KEY,
    uptimeS: Math.round(process.uptime())
  });
});
io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});
var aiClient = null;
var getAI2 = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  if (!aiClient) {
    aiClient = new import_genai3.GoogleGenAI({
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
      const ai = getAI2();
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
      const text = response.text;
      if (text) return text;
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
    const { userText, history, systemPrompt } = import_zod5.z.object({
      userText: import_zod5.z.string().min(1),
      history: import_zod5.z.array(import_zod5.z.object({ role: import_zod5.z.string(), text: import_zod5.z.string() })).optional(),
      systemPrompt: import_zod5.z.string().optional()
    }).parse(req.body);
    const safeUserText = (0, import_xss5.default)(userText);
    const safeSystemPrompt = systemPrompt ? (0, import_xss5.default)(systemPrompt) : void 0;
    let contents = safeUserText;
    if (history && history.length > 0) {
      contents = history.map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: (0, import_xss5.default)(h.text) }]
      }));
      contents.push({ role: "user", parts: [{ text: safeUserText }] });
    }
    const ai = new import_genai3.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
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
    if (error instanceof import_zod5.z.ZodError) {
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
    const schema = import_zod5.z.object({
      question: import_zod5.z.string().min(1),
      stream: import_zod5.z.boolean().optional(),
      location: import_zod5.z.object({ lat: import_zod5.z.number(), lng: import_zod5.z.number() }).optional()
    });
    const parsed = schema.parse(req.body);
    const question = (0, import_xss5.default)(parsed.question);
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
          res.write(`data: ${JSON.stringify({ chunk: "Hello! I am your AI assistant. How can I help?" })}

`);
          return res.end();
        }
        return res.json({ answer: "Hello! I am your AI assistant. How can I help?" });
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
    if (outerError instanceof import_zod5.z.ZodError) {
      return res.status(400).json({ error: "Invalid input" });
    }
    return res.status(500).json({ error: outerError.message });
  }
});
var supabaseConfigured2 = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
var supabase3 = supabaseConfigured2 ? (0, import_supabase_js3.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY) : null;
var drivingStore = supabase3 && process.env.SUPABASE_SERVICE_ROLE_KEY ? new SupabaseMirroredDrivingModeStore(supabase3) : new MemoryDrivingModeStore();
app.use(createDrivingRouter({ store: drivingStore, io, jwtSecret: process.env.JWT_SECRET }));
var incidentStore = supabase3 && process.env.SUPABASE_SERVICE_ROLE_KEY ? new SupabaseMirroredStore(supabase3) : new MemoryIncidentStore();
var incidentEngine = new IncidentEngine({
  store: incidentStore,
  io,
  getTwilio,
  fromNumber: process.env.TWILIO_FROM_NUMBER,
  drivingModeStore: drivingStore,
  // Support both the canonical HOSPITAL_NUMBER and the legacy mixed-case spelling for backwards compat
  hospitalNumber: process.env.HOSPITAL_NUMBER ?? process.env.Hospital_NUMBER,
  policeNumber: process.env.POLICE_NUMBER
});
app.use(createIncidentRouter(incidentEngine, incidentStore, io));
app.use("/api/traffic", createTrafficRouter({ supabase: supabase3, io }));
var twilioClient = null;
function getTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials not configured");
  if (!twilioClient) twilioClient = (0, import_twilio3.default)(sid, token);
  return twilioClient;
}
app.get("/api/config/maps", (req, res) => {
  res.json({ apiKey: process.env.GOOGLE_MAPS_BROWSER_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY || "" });
});
app.get("/api/config/hospital", (req, res) => {
  const num = process.env.HOSPITAL_NUMBER ?? process.env.Hospital_NUMBER;
  res.json({ isConfigured: !!num });
});
app.get("/api/config/police", (req, res) => {
  const num = process.env.POLICE_NUMBER;
  res.json({ isConfigured: !!num });
});
app.post("/api/medical/analyze-and-recommend", async (req, res) => {
  try {
    const schema = import_zod5.z.object({
      patient: import_zod5.z.object({
        name: import_zod5.z.string().optional(),
        phone: import_zod5.z.string().optional(),
        bloodGroup: import_zod5.z.string().optional(),
        allergies: import_zod5.z.string().optional(),
        conditions: import_zod5.z.string().optional()
      }),
      reason: import_zod5.z.string().default("Voice activated emergency distress alert (HELP spoken 3 times)"),
      sensorSummary: import_zod5.z.record(import_zod5.z.string(), import_zod5.z.any()).optional(),
      location: import_zod5.z.object({ lat: import_zod5.z.number(), lng: import_zod5.z.number() }).optional()
    });
    const parsed = schema.parse(req.body);
    const result = await analyzeMedicalConditionAndRecommendHospitals(parsed);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message || "Medical analysis failed" });
  }
});
app.post("/api/ai/voice-process", async (req, res) => {
  try {
    const { transcript } = import_zod5.z.object({ transcript: import_zod5.z.string().min(1) }).parse(req.body);
    const safeTranscript = (0, import_xss5.default)(transcript);
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
      const text = await generateAIResponse(prompt, true);
      let mode = "GENERAL";
      if (text.includes("[MODE: EMERGENCY]")) mode = "EMERGENCY";
      else if (text.includes("[MODE: TRAINING]")) mode = "TRAINING";
      res.json({ mode, content: text.replace(/\[MODE: .*?\]/, "").replace(/Content:/, "").trim(), original_transcript: safeTranscript });
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
var voiceAgentMutex = Promise.resolve();
app.post("/api/ai/voice-agent", async (req, res) => {
  try {
    const { transcript, location, history } = import_zod5.z.object({
      transcript: import_zod5.z.string().optional(),
      location: import_zod5.z.object({ lat: import_zod5.z.number(), lng: import_zod5.z.number() }).optional(),
      history: import_zod5.z.array(import_zod5.z.object({ role: import_zod5.z.string(), parts: import_zod5.z.array(import_zod5.z.object({ text: import_zod5.z.string() })) })).optional()
    }).parse(req.body);
    const safeTranscript = (0, import_xss5.default)(transcript || "");
    const cleanTranscript = safeTranscript.trim();
    if (!cleanTranscript || cleanTranscript.length === 0) {
      return res.json({ text: "I'm listening." });
    }
    const executeVoiceAgent = async () => {
      try {
        const ai = getAI2();
        const execute_sos_dispatch = {
          name: "execute_sos_dispatch",
          description: "ONLY trigger the SOS emergency dispatch if the user EXPLICITLY states they are in a life-threatening emergency, have had a severe accident, or explicitly ask for an ambulance. DO NOT use this for general questions, inquiries, or casual chat.",
          parameters: {
            type: import_genai3.Type.OBJECT,
            properties: { type: { type: import_genai3.Type.STRING, description: "The type of emergency, e.g. medical, crash, danger" } },
            required: ["type"]
          }
        };
        const Maps_to_nearest_hospital = {
          name: "Maps_to_nearest_hospital",
          description: "Triggers the Google Places API and routing to navigate to the nearest hospital on the map.",
          parameters: {
            type: import_genai3.Type.OBJECT,
            properties: {},
            required: []
          }
        };
        const toggle_traffic_layer = {
          name: "toggle_traffic_layer",
          description: "Turns the Google Maps traffic layer on or off.",
          parameters: {
            type: import_genai3.Type.OBJECT,
            properties: { state: { type: import_genai3.Type.BOOLEAN, description: "True to turn traffic on, false to turn it off." } },
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
          const fallbackAns = findTrainedAnswer(cleanTranscript);
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
app.get("/api/geoapify/nearby", async (req, res) => {
  try {
    const parsed = import_zod5.z.object({ lat: import_zod5.z.string(), lng: import_zod5.z.string() }).parse(req.query);
    const lat = (0, import_xss5.default)(parsed.lat);
    const lng = (0, import_xss5.default)(parsed.lng);
    const GEO_API_KEY = process.env.GEOAPIFY_API_KEY;
    if (!GEO_API_KEY) {
      return res.status(500).json({ error: "Server misconfiguration: GEOAPIFY_API_KEY is not set." });
    }
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
    const parsed = import_zod5.z.object({ lat: import_zod5.z.string(), lng: import_zod5.z.string() }).parse(req.query);
    const lat = (0, import_xss5.default)(parsed.lat);
    const lng = (0, import_xss5.default)(parsed.lng);
    const GEO_API_KEY = process.env.GEOAPIFY_API_KEY;
    if (!GEO_API_KEY) {
      return res.status(500).json({ error: "Server misconfiguration: GEOAPIFY_API_KEY is not set." });
    }
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
    const body = req.body;
    const rawMask = req.headers["x-goog-fieldmask"];
    const fieldMask = rawMask ? (0, import_xss5.default)(rawMask) : "places.displayName,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber";
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
    const body = req.body;
    const rawMask = req.headers["x-goog-fieldmask"];
    const fieldMask = rawMask ? (0, import_xss5.default)(rawMask) : "places.displayName,places.location,places.formattedAddress";
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
    app.use(import_express5.default.static(import_path.default.join(process.cwd(), "dist")));
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
