import { GoogleGenAI } from "@google/genai";
import xss from "xss";
import { retrieveContext } from "./rag.js";
import { AI_TIERS, MEDICAL_CONFIDENCE_THRESHOLD } from "./aiConfig.js";

export interface AiMedicalAnalysis {
  condition: string;
  severity: "CRITICAL" | "HIGH" | "MODERATE" | "MILD";
  possibleDiseasesOrInjuries: string[];
  firstAidInstructions: string[];
  specialtiesNeeded: string[];
  triageSummary: string;
  confidence?: number;
  groundedInRetrievedContext?: boolean;
}

export interface RecommendedHospital {
  name: string;
  address?: string;
  distanceKm: number;
  phone?: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  recommendationReason: string;
  mapsUrl: string;
}

export interface MedicalAnalysisResult {
  analysis: AiMedicalAnalysis;
  recommendedHospitals: RecommendedHospital[];
  primaryHospital: RecommendedHospital | null;
}

/** Haversine formula to compute distance in kilometers */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/** Fetch nearby hospitals using Google Places API (New) with Geoapify fallback */
export async function fetchNearbyHospitals(lat: number, lng: number, radiusM = 10000): Promise<Array<{
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  rating?: number;
  userRatingCount?: number;
}>> {
  const googleApiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY;
  if (googleApiKey) {
    try {
      const placesUrl = "https://places.googleapis.com/v1/places:searchNearby";
      const res = await fetch(placesUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googleApiKey,
          "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.primaryType",
        },
        body: JSON.stringify({
          includedTypes: ["hospital"],
          maxResultCount: 8,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: radiusM,
            },
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.places && Array.isArray(data.places) && data.places.length > 0) {
          return data.places.map((p: any) => ({
            name: p.displayName?.text || p.formattedAddress || "Medical Facility",
            address: p.formattedAddress || "",
            lat: p.location?.latitude ?? lat,
            lng: p.location?.longitude ?? lng,
            phone: p.nationalPhoneNumber || p.internationalPhoneNumber,
            rating: p.rating,
            userRatingCount: p.userRatingCount,
          }));
        }
      }
    } catch (e: any) {
      console.warn("[MedicalService] Google Places API lookup failed, trying fallback:", e.message);
    }
  }

  // Fallback: Geoapify
  const geoApiKey = process.env.GEOAPIFY_API_KEY;
  if (geoApiKey) {
    try {
      const geoUrl = `https://api.geoapify.com/v2/places?categories=healthcare.hospital&filter=circle:${lng},${lat},${radiusM}&limit=8&apiKey=${geoApiKey}`;
      const res = await fetch(geoUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.features && Array.isArray(data.features) && data.features.length > 0) {
          return data.features.map((f: any) => ({
            name: f.properties?.name || f.properties?.address_line1 || "Hospital",
            address: f.properties?.formatted || f.properties?.address_line2 || "",
            lat: f.geometry?.coordinates?.[1] ?? lat,
            lng: f.geometry?.coordinates?.[0] ?? lng,
            phone: f.properties?.contact?.phone || f.properties?.datasource?.raw?.phone,
            rating: undefined,
          }));
        }
      }
    } catch (e: any) {
      console.warn("[MedicalService] Geoapify fallback failed:", e.message);
    }
  }

  // Final offline fallback emergency hospitals relative to coordinates
  return [
    {
      name: "City General Trauma & Emergency Hospital",
      address: "Emergency Medical Zone",
      lat: lat + 0.015,
      lng: lng + 0.012,
      phone: "112",
      rating: 4.6,
    },
    {
      name: "District Multi-Specialty Medical Center",
      address: "Civil Hospital Road",
      lat: lat - 0.018,
      lng: lng + 0.015,
      phone: "112",
      rating: 4.4,
    },
    {
      name: "Apex Critical Care & 24/7 Trauma Unit",
      address: "Metro Healthcare Hub",
      lat: lat + 0.022,
      lng: lng - 0.019,
      phone: "112",
      rating: 4.7,
    },
  ];
}

/** Rule-based clinical fallback when Gemini API is unavailable */
export function getLocalClinicalFallback(
  patient: { name?: string; bloodGroup?: string; allergies?: string; conditions?: string },
  reason: string,
  sensorSummary?: Record<string, any>
): AiMedicalAnalysis {
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
        "Keep patient calm and avoid any physical exertion.",
      ],
      specialtiesNeeded: ["Cardiology", "Cath Lab", "Cardiac ICU", "Emergency Medicine"],
      triageSummary: "Urgent suspected cardiac distress. Immediate ECG, oxygenation, and cardiology team readiness required.",
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
        "Reassure the patient and do not crowd around them.",
      ],
      specialtiesNeeded: ["Pulmonology", "Respiratory ICU", "Emergency Medicine"],
      triageSummary: "Severe respiratory distress with airway vulnerability. Immediate nebulization and oxygen therapy needed.",
    };
  }

  if (peakG > 5.0 || text.includes("crash") || text.includes("impact") || text.includes("accident") || text.includes("head") || text.includes("fracture") || text.includes("bleed")) {
    return {
      condition: "High-Energy Blunt Trauma & Suspected Internal Injury",
      severity: peakG > 8.0 ? "CRITICAL" : "HIGH",
      possibleDiseasesOrInjuries: ["Traumatic Brain Injury / Concussion", "Internal Hemorrhage", "Spinal Trauma", "Bone Fractures"],
      firstAidInstructions: [
        "Do not move patient or manipulate neck/spine unless in immediate fire/environmental danger.",
        "Apply firm, continuous pressure with a sterile cloth to any active bleeding sites.",
        "Keep patient warm with a jacket/blanket to prevent hypothermic shock.",
        "Continuously monitor airway and responsiveness until paramedics arrive.",
      ],
      specialtiesNeeded: ["Level-1 Trauma Care", "Orthopedic Surgery", "Neurosurgery", "Blood Transfusion Unit"],
      triageSummary: `High-energy road impact (${peakG > 0 ? `${peakG.toFixed(1)}G` : "severe impact"}). Surgical trauma triage and radiological imaging required upon arrival.`,
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
      "Comfort the patient and stay on the line with emergency services.",
    ],
    specialtiesNeeded: ["24/7 Emergency Medicine", "Intensive Care Unit", "General Surgery"],
    triageSummary: "Emergency distress triggered by user voice activation. Full clinical vitals assessment and stabilization needed.",
  };
}

/** Analyze patient condition & disease with Gemini API and select recommended hospitals */
export async function analyzeMedicalConditionAndRecommendHospitals(params: {
  patient: { name?: string; phone?: string; bloodGroup?: string; allergies?: string; conditions?: string };
  reason: string;
  sensorSummary?: Record<string, any>;
  location?: { lat: number; lng: number };
}): Promise<MedicalAnalysisResult> {
  const { patient, reason, sensorSummary, location } = params;
  const lat = location?.lat ?? 12.9716;
  const lng = location?.lng ?? 77.5946;

  // 1. Fetch nearby hospitals from Google Maps / Geoapify
  const rawHospitals = await fetchNearbyHospitals(lat, lng);
  const hospitalsWithDistance = rawHospitals.map(h => ({
    ...h,
    distanceKm: calculateDistanceKm(lat, lng, h.lat, h.lng),
  })).sort((a, b) => a.distanceKm - b.distanceKm);

  // 2. Query Gemini API for disease analysis and hospital recommendation
  let analysis: AiMedicalAnalysis;
  let recommendedHospitalName: string | undefined;
  let recommendationReason: string | undefined;

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const hospitalListStr = hospitalsWithDistance.slice(0, 5).map((h, i) =>
        `${i + 1}. "${h.name}" (${h.distanceKm} km away, Address: ${h.address}, Phone: ${h.phone || "N/A"}, Rating: ${h.rating ?? "N/A"})`
      ).join("\n");

      const retrievedContext = await retrieveContext(reason, 'medical');
      const retrievedContextStr = retrievedContext.length > 0 ? "\nRETRIEVED KNOWLEDGE BASE CONTEXT:\n" + retrievedContext.map((r: any) => r.content).join("\n") + "\n" : "";

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
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text || "";
      const cleanedJsonStr = responseText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanedJsonStr);

      const confidence = parsed.confidence ?? 1.0;
      const grounded = parsed.groundedInRetrievedContext ?? true;
      let instructions = Array.isArray(parsed.firstAidInstructions) ? parsed.firstAidInstructions : [];

      if (confidence < MEDICAL_CONFIDENCE_THRESHOLD || !grounded) {
        console.warn(`[MedicalService] Low confidence (${confidence}, threshold: ${MEDICAL_CONFIDENCE_THRESHOLD}) or ungrounded (${grounded}). Appending disclaimer.`);
        instructions.push("PLEASE NOTE: Please also contact a medical professional / emergency services for definitive guidance.");
      }

      analysis = {
        condition: parsed.condition || "Acute Emergency Distress",
        severity: (["CRITICAL", "HIGH", "MODERATE", "MILD"].includes(parsed.severity) ? parsed.severity : "HIGH") as any,
        possibleDiseasesOrInjuries: Array.isArray(parsed.possibleDiseasesOrInjuries) ? parsed.possibleDiseasesOrInjuries : [],
        firstAidInstructions: instructions,
        specialtiesNeeded: Array.isArray(parsed.specialtiesNeeded) ? parsed.specialtiesNeeded : [],
        triageSummary: parsed.triageSummary || "Emergency triage initiated. Immediate vitals assessment recommended.",
        confidence,
        groundedInRetrievedContext: grounded
      };
      recommendedHospitalName = parsed.recommendedHospitalName;
      recommendationReason = parsed.recommendationReason;
    } catch (err: any) {
      console.warn("[MedicalService] Gemini API analysis failed or threw, using clinical fallback:", err.message);
      analysis = getLocalClinicalFallback(patient, reason, sensorSummary);
    }
  } else {
    analysis = getLocalClinicalFallback(patient, reason, sensorSummary);
  }

  // 3. Build recommended hospitals list
  const recommendedHospitals: RecommendedHospital[] = hospitalsWithDistance.slice(0, 5).map((h, idx) => {
    const isPrimary = recommendedHospitalName
      ? h.name.toLowerCase().includes(recommendedHospitalName.toLowerCase()) || recommendedHospitalName.toLowerCase().includes(h.name.toLowerCase())
      : idx === 0;

    const defaultReason = idx === 0
      ? `Nearest 24/7 Emergency Hospital (${h.distanceKm} km) equipped for acute stabilization`
      : `${h.distanceKm} km away with emergency medical support`;

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
      mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`,
    };
  });

  // Sort so the primary recommended hospital is first
  if (recommendedHospitalName) {
    const primaryIdx = recommendedHospitals.findIndex(
      h => h.name.toLowerCase().includes(recommendedHospitalName!.toLowerCase()) ||
           recommendedHospitalName!.toLowerCase().includes(h.name.toLowerCase())
    );
    if (primaryIdx > 0) {
      const [primary] = recommendedHospitals.splice(primaryIdx, 1);
      recommendedHospitals.unshift(primary);
    }
  }

  return {
    analysis,
    recommendedHospitals,
    primaryHospital: recommendedHospitals[0] || null,
  };
}
