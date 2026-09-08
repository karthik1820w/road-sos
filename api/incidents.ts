/**
 * Incident engine — Feature 2: multi-channel SOS with responder acknowledgement.
 *
 * Every SOS is an Incident with an explicit state machine:
 *
 *   DETECTED ─► PROBING ─► DISPATCHED ─► ACKED ─► CLOSED
 *       │           │            │
 *       └───────────┴────────────┴──► CANCELLED
 *
 * Dispatch fans out per contact over independent channels (SMS, voice call) with
 * retries and *real* delivery status (Twilio status callbacks). A failed Twilio
 * send is reported as failed — never as success — so the client can fall back to
 * native SMS / 112. One PDF handover report is generated per incident and served
 * behind an HMAC-signed link + QR code.
 *
 * State lives in an IncidentStore. The in-memory store is the default; when
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set every mutation is also
 * persisted to the `incidents` table (see supabase/schema.sql) so a restart or a
 * second server instance can recover it.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { z } from "zod";
import xss from "xss";
import twilio from "twilio";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Server as SocketServer } from "socket.io";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type AiMedicalAnalysis, type RecommendedHospital, analyzeMedicalConditionAndRecommendHospitals } from "./medical.js";

// ───────────────────────────── Types ─────────────────────────────

export type IncidentState = "DETECTED" | "PROBING" | "DISPATCHED" | "ACKED" | "CLOSED" | "CANCELLED";
export type IncidentKind = "CRASH" | "MANUAL_SOS" | "SAFETY_WORD" | "VOICE_HELP" | "MEDICAL";
export type Channel = "sms" | "call";
export type DeliveryStatus = "queued" | "sent" | "delivered" | "answered" | "failed" | "no_answer";

export interface Delivery {
  id: string;
  channel: Channel;
  to: string;
  status: DeliveryStatus;
  attempts: number;
  sid?: string;
  error?: string;
  updatedAt: number;
}

export interface Incident {
  id: string;
  deviceToken: string;
  kind: IncidentKind;
  state: IncidentState;
  reason: string;
  createdAt: number;
  updatedAt: number;
  location?: { lat: number; lng: number; accuracyM?: number };
  locationHistory?: { lat: number; lng: number; accuracyM?: number; speedMps?: number; at: number }[];
  address?: string;
  confidence?: "LOW" | "MEDIUM" | "HIGH";
  sensorSummary?: Record<string, number | string | boolean>;
  patient: { name: string; phone?: string; bloodGroup?: string; allergies?: string; conditions?: string };
  contacts: string[];
  deliveries: Delivery[];
  ack?: { by: string; at: number; via: "call_keypress" | "sms_reply" | "console" };
  history: { state: IncidentState; at: number; note?: string }[];
  reportToken: string;
  aiMedicalAnalysis?: AiMedicalAnalysis;
  recommendedHospitals?: RecommendedHospital[];
}

const TRANSITIONS: Record<IncidentState, IncidentState[]> = {
  DETECTED: ["PROBING", "DISPATCHED", "CANCELLED"],
  PROBING: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["ACKED", "CLOSED", "CANCELLED"],
  ACKED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransition(from: IncidentState, to: IncidentState): boolean {
  return TRANSITIONS[from].includes(to);
}

// ───────────────────────────── Store ─────────────────────────────

export interface IncidentStore {
  get(id: string): Promise<Incident | undefined>;
  save(incident: Incident): Promise<void>;
  saveEmergencyLog(incident: Incident): Promise<void>;
  /** Most recent open incident whose contacts include `phone` (used to match inbound SMS replies). */
  findOpenByContact(phone: string): Promise<Incident | undefined>;
}

export class MemoryIncidentStore implements IncidentStore {
  private items = new Map<string, Incident>();
  async get(id: string) { return this.items.get(id); }
  async save(incident: Incident) { this.items.set(incident.id, incident); }
  async saveEmergencyLog(incident: Incident) { /* no-op in memory */ }
  async findOpenByContact(phone: string) {
    const digits = normalizePhone(phone);
    return [...this.items.values()]
      .filter(i => (i.state === "DISPATCHED") && i.contacts.some(c => normalizePhone(c) === digits))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
}

/** Memory-first store that mirrors every write to Supabase (best-effort). */
export class SupabaseMirroredStore extends MemoryIncidentStore {
  constructor(private supabase: SupabaseClient) { super(); }
  async get(id: string) {
    const local = await super.get(id);
    if (local) return local;
    const { data } = await this.supabase.from("incidents").select("payload").eq("id", id).maybeSingle();
    if (data?.payload) { const inc = data.payload as Incident; await super.save(inc); return inc; }
    return undefined;
  }
  async save(incident: Incident) {
    await super.save(incident);
    try {
      await this.supabase.from("incidents").upsert({
        id: incident.id, state: incident.state, kind: incident.kind,
        lat: incident.location?.lat ?? null, lng: incident.location?.lng ?? null,
        created_at: new Date(incident.createdAt).toISOString(),
        updated_at: new Date(incident.updatedAt).toISOString(),
        payload: incident,
      });
    } catch (e: any) {
      console.warn("[Incidents] Supabase mirror failed:", e?.message);
    }
  }
  async saveEmergencyLog(incident: Incident) {
    try {
      const isDanger = incident.kind === "MANUAL_SOS" || incident.kind === "SAFETY_WORD";
      const condition_summary = incident.aiMedicalAnalysis 
        ? `${incident.aiMedicalAnalysis.condition} [${incident.aiMedicalAnalysis.severity}]`
        : null;

      await this.supabase.from("emergency_logs").insert({
        incident_id: incident.id,
        device_token: incident.deviceToken,
        pathway: isDanger ? "danger" : "medical",
        trigger_reason: incident.reason,
        condition_summary,
        recipients: incident.contacts,
        location: incident.location,
        dispatch_status: {},
      });
    } catch (e: any) {
      console.warn("[Incidents] Supabase emergency_logs insert failed:", e?.message);
    }
  }
}

// ───────────────────────────── Helpers ─────────────────────────────

export function normalizePhone(raw: string): string {
  const trimmed = raw.replace(/[^\d+]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (/^0\d{10}$/.test(trimmed)) return `+91${trimmed.slice(1)}`;
  if (/^\d{10}$/.test(trimmed)) return `+91${trimmed}`;
  if (/^91\d{10}$/.test(trimmed)) return `+${trimmed}`;
  return `+${trimmed}`;
}

export function isValidE164(p: string) { return /^\+[1-9]\d{7,14}$/.test(p); }

// HMAC secret for signed medical-report links. INCIDENT_SIGNING_SECRET or JWT_SECRET
// should be set explicitly in any real deployment. We deliberately do NOT fall back to
// a hardcoded string here: a secret baked into the source is not a secret, and it would
// let anyone forge a valid report token for any incident ID, exposing patient name,
// phone, medical conditions and precise GPS location behind what looks like a signed
// link. If neither env var is configured we instead generate a random secret once per
// process boot — every report link is still validly signed for the life of that process,
// but nobody can pre-compute a token from reading the repo.
let processSecret: string | null = null;
const secret = () => {
  const configured = process.env.INCIDENT_SIGNING_SECRET || process.env.JWT_SECRET;
  if (configured) return configured;
  if (!processSecret) {
    processSecret = crypto.randomBytes(32).toString("hex");
    console.warn(
      "[Incidents] INCIDENT_SIGNING_SECRET and JWT_SECRET are both unset. Generated a random " +
        "in-memory signing secret for this process only — report links will stop validating " +
        "after any restart or across multiple instances. Set INCIDENT_SIGNING_SECRET in production."
    );
  }
  return processSecret;
};
export const signReportToken = (incidentId: string) =>
  crypto.createHmac("sha256", secret()).update(incidentId).digest("hex").slice(0, 32);

const mapsLink = (loc?: { lat: number; lng: number }) =>
  loc ? `https://www.google.com/maps?q=${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}` : "location unavailable";

function publicBaseUrl(req: Request) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  return `${proto}://${req.get("host")}`;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ───────────────────────────── Engine ─────────────────────────────

import type { DrivingModeStore } from './drivingMode.js';

export interface EngineDeps {
  store: IncidentStore;
  io?: SocketServer;
  getTwilio: () => twilio.Twilio; // throws when not configured
  fromNumber?: string;
  now?: () => number;
  drivingModeStore?: DrivingModeStore;
  /** Number dispatched on VOICE_HELP / MEDICAL / CRASH incidents (HOSPITAL_NUMBER env var). */
  hospitalNumber?: string;
  /** Number dispatched on MANUAL_SOS / SAFETY_WORD incidents (POLICE_NUMBER env var). */
  policeNumber?: string;
}

export class IncidentEngine {
  private idempotency = new Map<string, string>();
  constructor(private deps: EngineDeps) {}

  private now() { return this.deps.now ? this.deps.now() : Date.now(); }

  private emit(incident: Incident) {
    this.deps.io?.to(`incident:${incident.id}`).emit("incident:update", publicView(incident));
  }

  private async transition(incident: Incident, to: IncidentState, note?: string) {
    if (incident.state === to) return incident;
    if (!canTransition(incident.state, to)) {
      throw Object.assign(new Error(`Illegal transition ${incident.state} → ${to}`), { status: 409 });
    }
    incident.state = to;
    incident.updatedAt = this.now();
    incident.history.push({ state: to, at: incident.updatedAt, note });
    await this.deps.store.save(incident);
    this.emit(incident);
    return incident;
  }

  async create(input: Omit<Incident, "id" | "state" | "createdAt" | "updatedAt" | "deliveries" | "history" | "reportToken">, idempotencyKey?: string) {
    if (idempotencyKey && this.idempotency.has(idempotencyKey)) {
      const existing = await this.deps.store.get(this.idempotency.get(idempotencyKey)!);
      if (existing) return existing;
    }
    const id = crypto.randomUUID();
    const t = this.now();
    const incident: Incident = {
      ...input,
      id,
      state: input.kind === "CRASH" ? "PROBING" : "DETECTED",
      createdAt: t,
      updatedAt: t,
      deliveries: [],
      history: [{ state: input.kind === "CRASH" ? "PROBING" : "DETECTED", at: t }],
      reportToken: signReportToken(id),
    };
    await this.deps.store.save(incident);

    // Auto-disable driving mode immediately on server when any emergency incident is created
    if (this.deps.drivingModeStore && input.deviceToken) {
      const reason = input.kind === 'CRASH' ? 'crash_detected' : (input.kind === 'SAFETY_WORD' ? 'distress_word' : 'manual_sos');
      this.deps.drivingModeStore.disable(input.deviceToken, reason).catch(() => {});
      this.deps.io?.to(`user:${input.deviceToken}`).emit('driving_mode:forced_off', { userId: input.deviceToken, active: false, reason });
      this.deps.io?.emit('driving_mode:forced_off', { userId: input.deviceToken, active: false, reason });
    }

    if (idempotencyKey) {
      this.idempotency.set(idempotencyKey, id);
      setTimeout(() => this.idempotency.delete(idempotencyKey), 10 * 60 * 1000).unref?.();
    }
    return incident;
  }

  async cancel(incident: Incident, note = "Cancelled by user") { return this.transition(incident, "CANCELLED", note); }
  async close(incident: Incident) { return this.transition(incident, "CLOSED"); }

  async acknowledge(incident: Incident, by: string, via: "call_keypress" | "sms_reply" | "console") {
    if (incident.state === "ACKED" || incident.state === "CLOSED") return incident;
    incident.ack = { by, at: this.now(), via };
    await this.transition(incident, "ACKED", `Acknowledged by ${by} via ${via}`);
    return incident;
  }

  /**
   * Fan out SMS + voice call to every contact. Idempotent: calling twice on a
   * DISPATCHED incident returns the current delivery table without re-sending.
   */
  async dispatch(incident: Incident, baseUrl: string) {
    if (incident.state === "DISPATCHED" || incident.state === "ACKED") return incident;

    // Determine which emergency-services number to prepend based on incident pathway:
    //   MANUAL_SOS / SAFETY_WORD → POLICE_NUMBER (danger pathway)
    //   VOICE_HELP / MEDICAL / CRASH → HOSPITAL_NUMBER (medical pathway)
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

    // Attach Gemini medical condition analysis and nearby recommended hospitals if not yet present
    if (!incident.aiMedicalAnalysis || !incident.recommendedHospitals) {
      try {
        const medResult = await analyzeMedicalConditionAndRecommendHospitals({
          patient: incident.patient,
          reason: incident.reason,
          sensorSummary: incident.sensorSummary,
          location: incident.location,
        });
        if (!incident.aiMedicalAnalysis) incident.aiMedicalAnalysis = medResult.analysis;
        if (!incident.recommendedHospitals) incident.recommendedHospitals = medResult.recommendedHospitals;
        await this.deps.store.save(incident);
      } catch (e: any) {
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

    // Each contact is processed concurrently and independently (Promise.allSettled = per-target
    // failure isolation: one failed recipient cannot abort others).
    await Promise.allSettled(incident.contacts.map(async (to) => {
      const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
      await this.sendWithRetry(incident, "sms", to, async (client) => {
        const msg = await client.messages.create({
          to, from: this.deps.fromNumber!, body: smsBody,
          ...(isLocal ? {} : { statusCallback: `${baseUrl}/api/twilio/incidents/${incident.id}/status?channel=sms` }),
        });
        return msg.sid;
      });
      await this.sendWithRetry(incident, "call", to, async (client) => {
        const gatherUrl = `${baseUrl}/api/twilio/incidents/${incident.id}/gather?to=${encodeURIComponent(to)}`;
        const twiml = new twilio.twiml.VoiceResponse();
        const gather = twiml.gather({ numDigits: 1, action: gatherUrl, method: "POST", timeout: 12 });
        gather.say({ loop: 2 }, sayText);
        twiml.say("No confirmation received. Goodbye.");
        const call = await client.calls.create({
          to, from: this.deps.fromNumber!, twiml: twiml.toString(),
          ...(isLocal ? {} : { statusCallback: `${baseUrl}/api/twilio/incidents/${incident.id}/status?channel=call` }),
          statusCallbackEvent: ["initiated", "answered", "completed"],
        });
        return call.sid;
      });
    }));

    incident.updatedAt = this.now();
    await this.deps.store.save(incident);
    this.emit(incident);

    // Alert if all channels failed
    if (incident.deliveries.length > 0 && incident.deliveries.every(d => d.status === "failed")) {
      console.error(`[IncidentEngine] FATAL: All dispatch channels failed for incident ${incident.id}`);
      if (this.deps.io) {
        this.deps.io.emit('incident:dispatch_failed', incident);
      }
      const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'dispatch_failed',
            incidentId: incident.id,
            reason: incident.deliveries[0]?.error || 'Unknown'
          })
        }).catch(e => console.warn('[OpsAlert] Failed to fire webhook:', e.message));
      }
    }

    return incident;
  }


  private async sendWithRetry(incident: Incident, channel: Channel, to: string, fn: (c: twilio.Twilio) => Promise<string>) {
    const delivery: Delivery = { id: crypto.randomUUID(), channel, to, status: "queued", attempts: 0, updatedAt: this.now() };
    incident.deliveries.push(delivery);
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      delivery.attempts = attempt;
      try {
        if (!this.deps.fromNumber) throw new Error("TWILIO_FROM_NUMBER is not configured");
        const client = this.deps.getTwilio();
        delivery.sid = await fn(client);
        delivery.status = "sent";
        delivery.error = undefined;
        delivery.updatedAt = this.now();
        await this.deps.store.save(incident);
        this.emit(incident);
        return;
      } catch (e: any) {
        const msg: string = e?.message || String(e);
        delivery.error = msg;
        delivery.updatedAt = this.now();
        // Non-retryable: auth, unverified trial destination, invalid number, missing config
        const permanent = /Authenticate|credentials|unverified|Trial|not a valid phone|not configured|permission/i.test(msg);
        if (permanent || attempt === maxAttempts) {
          delivery.status = "failed";
          console.error(`[Incident ${incident.id}] ${channel} → ${to} FAILED (${attempt}/${maxAttempts}): ${msg}`);
          await this.deps.store.save(incident);
          this.emit(incident);
          return;
        }
        await sleep(600 * Math.pow(2, attempt - 1));
      }
    }
  }

  /** Twilio status callback → delivery row. */
  async updateDeliveryStatus(incident: Incident, channel: Channel, sid: string | undefined, rawStatus: string) {
    const d = incident.deliveries.find(x => x.channel === channel && (sid ? x.sid === sid : true));
    if (!d) return;
    const s = rawStatus.toLowerCase();
    if (channel === "sms") {
      if (s === "delivered") d.status = "delivered";
      else if (s === "failed" || s === "undelivered") { d.status = "failed"; d.error = `Carrier status: ${s}`; }
    } else {
      if (s === "in-progress" || s === "answered") d.status = "answered";
      else if (s === "completed") { if (d.status !== "answered") d.status = "no_answer"; }
      else if (s === "no-answer" || s === "busy") d.status = "no_answer";
      else if (s === "failed" || s === "canceled") { d.status = "failed"; d.error = `Call status: ${s}`; }
    }
    d.updatedAt = this.now();
    incident.updatedAt = d.updatedAt;
    await this.deps.store.save(incident);
    this.emit(incident);
  }
}

// ───────────────────────────── Messages ─────────────────────────────

export function buildSmsBody(incident: Incident, baseUrl: string) {
  const who = incident.patient.name?.trim() || incident.patient.phone || "A RoadSOS user";
  const kind = incident.kind === "CRASH" ? "possible road crash detected"
    : incident.kind === "SAFETY_WORD" ? "silent distress signal"
    : incident.kind === "MEDICAL" ? "medical emergency"
    : incident.kind === "VOICE_HELP" ? "urgent HELP distress signal"
    : "emergency";
  const conf = incident.confidence ? ` (${incident.confidence.toLowerCase()} confidence)` : "";
  const staticLoc = incident.address ? `${incident.address}\n${mapsLink(incident.location)}` : mapsLink(incident.location);
  const liveTracking = `Live Tracking: ${baseUrl}/track/${incident.id}?t=${incident.reportToken}`;
  const reportUrl = `${baseUrl}/api/incidents/${incident.id}/report.pdf?t=${incident.reportToken}`;

  const med = [
    incident.patient.bloodGroup && `Blood: ${incident.patient.bloodGroup}`,
    incident.patient.allergies && `Allergies: ${incident.patient.allergies}`,
    incident.patient.conditions && `Conditions: ${incident.patient.conditions}`,
  ].filter(Boolean).join(" | ");

  const aiCondition = incident.aiMedicalAnalysis
    ? `Assessment: ${incident.aiMedicalAnalysis.condition} [${incident.aiMedicalAnalysis.severity}]`
    : undefined;

  const nearestHosp = incident.recommendedHospitals && incident.recommendedHospitals.length > 0
    ? `Recommended Hospital: ${incident.recommendedHospitals[0].name} (${incident.recommendedHospitals[0].distanceKm} km)`
    : undefined;

  return [
    `ROADSOS DISTRESS ALERT: ${who} — ${kind}${conf}.`,
    aiCondition,
    `Location (Static): ${staticLoc}`,
    liveTracking,
    med,
    nearestHosp,
    `Full report: ${reportUrl}`,
    `Reply ACK to confirm you are responding.`,
  ].filter(Boolean).join("\n\n");
}

export function buildCallScript(incident: Incident) {
  const who = incident.patient.name?.trim() || "a Road S O S user";
  const what = incident.kind === "CRASH" ? "may have been in a road accident and is not responding"
    : incident.kind === "SAFETY_WORD" ? "has sent a silent distress signal"
    : incident.kind === "VOICE_HELP" ? "has triggered emergency HELP distress"
    : "needs urgent help";
  const conditionStr = incident.aiMedicalAnalysis?.condition
    ? ` Preliminary condition: ${incident.aiMedicalAnalysis.condition}.`
    : "";
  const where = incident.address ? ` Location: ${incident.address}.` : (incident.location ? ` Location and full medical report have been sent by S M S.` : "");
  return `Emergency alert from Road S O S. ${who} ${what}.${conditionStr}${where} Press 1 to confirm ambulance dispatch.`;
}

export function publicView(i: Incident) {
  const { deviceToken, reportToken, ...rest } = i;
  return rest;
}

// ───────────────────────────── PDF ─────────────────────────────

export async function renderIncidentPdf(incident: Incident): Promise<Buffer> {
  const qr = await QRCode.toBuffer(mapsLink(incident.location), { width: 220, margin: 1 });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(22).text("RoadSOS Incident Handover", { align: "left" });
    doc.fontSize(10).fillColor("#555").text(`Incident ${incident.id}`).text(`Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
    doc.moveDown().fillColor("#000");

    doc.fontSize(14).text("Patient");
    doc.fontSize(11)
      .text(`Name: ${incident.patient.name || "Unknown"}`)
      .text(`Phone: ${incident.patient.phone || "Unknown"}`)
      .text(`Blood group: ${incident.patient.bloodGroup || "Unknown"}`)
      .text(`Allergies: ${incident.patient.allergies || "None recorded"}`)
      .text(`Conditions: ${incident.patient.conditions || "None recorded"}`);
    doc.moveDown();

    doc.fontSize(14).text("Incident");
    doc.fontSize(11)
      .text(`Type: ${incident.kind}${incident.confidence ? ` — ${incident.confidence} confidence` : ""}`)
      .text(`Reason: ${incident.reason}`)
      .text(`Time: ${new Date(incident.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`)
      .text(`Location: ${incident.address || "—"}`)
      .text(incident.location ? `Coordinates: ${incident.location.lat.toFixed(6)}, ${incident.location.lng.toFixed(6)}` : "Coordinates: unavailable");
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
          doc.text(`  • ${step}`);
        });
      }
      doc.moveDown(0.5).fillColor("#000");
    }

    if (incident.recommendedHospitals && incident.recommendedHospitals.length > 0) {
      doc.fontSize(13).fillColor("#1e40af").text("Recommended Nearby Hospitals (Google Maps)", { underline: true });
      doc.fontSize(10).fillColor("#000");
      incident.recommendedHospitals.slice(0, 3).forEach((h, idx) => {
        doc.text(`${idx + 1}. ${h.name} — ${h.distanceKm} km away — Phone: ${h.phone || "Emergency Line"}`);
        if (h.recommendationReason) doc.fontSize(8).fillColor("#555").text(`    Reason: ${h.recommendationReason}`).fillColor("#000").fontSize(10);
        if (h.address) doc.fontSize(8).fillColor("#777").text(`    Address: ${h.address}`).fillColor("#000").fontSize(10);
      });
      doc.moveDown(0.5);
    }

    doc.fontSize(14).text("Notification log");
    doc.fontSize(10);
    for (const h of incident.history) doc.text(`${new Date(h.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}  ${h.state}${h.note ? ` — ${h.note}` : ""}`);
    for (const d of incident.deliveries) doc.text(`${new Date(d.updatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}  ${d.channel.toUpperCase()} → ${d.to}: ${d.status}${d.error ? ` (${d.error})` : ""}`);
    doc.end();
  });
}

// ───────────────────────────── Router ─────────────────────────────

const createSchema = z.object({
  kind: z.enum(["CRASH", "MANUAL_SOS", "SAFETY_WORD", "VOICE_HELP", "MEDICAL"]),
  reason: z.string().min(1).max(300),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().optional() }).optional(),
  address: z.string().max(300).optional(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  sensorSummary: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  patient: z.object({
    name: z.string().max(80).default(""),
    phone: z.string().max(20).optional(),
    bloodGroup: z.string().max(10).optional(),
    allergies: z.string().max(200).optional(),
    conditions: z.string().max(200).optional(),
  }),
  contacts: z.array(z.string().min(7).max(20)).max(10),
  aiMedicalAnalysis: z.any().optional(),
  recommendedHospitals: z.any().optional(),
});

export function createIncidentRouter(engine: IncidentEngine, store: IncidentStore, io?: SocketServer) {
  const router = express.Router();

  const validateWebhooks = process.env.TWILIO_VALIDATE_WEBHOOKS
    ? process.env.TWILIO_VALIDATE_WEBHOOKS === "true"
    : process.env.NODE_ENV === "production";
  // Behind a tunnel/proxy set PUBLIC_BASE_URL so the signature is computed over the URL Twilio actually called.
  const twilioGuard = twilio.webhook({
    validate: validateWebhooks,
    ...(process.env.PUBLIC_BASE_URL ? { protocol: new URL(process.env.PUBLIC_BASE_URL).protocol.replace(":", ""), host: new URL(process.env.PUBLIC_BASE_URL).host } : {}),
  });

  // Device-token ownership check for mutating client routes.
  const requireOwner = async (req: Request, res: Response, next: NextFunction) => {
    const incident = await store.get(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    const token = req.header("x-device-token");
    if (!token || token !== incident.deviceToken) return res.status(403).json({ error: "Not the owning device" });
    (req as any).incident = incident;
    next();
  };

  router.post("/api/incidents", async (req, res) => {
    try {
      const deviceToken = req.header("x-device-token");
      if (!deviceToken || deviceToken.length < 16) return res.status(401).json({ error: "Missing device token" });
      const body = createSchema.parse(req.body);
      const contacts = [...new Set(body.contacts.map(normalizePhone))].filter(isValidE164);
      const incident = await engine.create({
        deviceToken,
        kind: body.kind,
        reason: xss(body.reason),
        location: body.location,
        address: body.address ? xss(body.address) : undefined,
        confidence: body.confidence,
        sensorSummary: body.sensorSummary,
        patient: {
          name: xss(body.patient.name), phone: body.patient.phone ? normalizePhone(body.patient.phone) : undefined,
          bloodGroup: body.patient.bloodGroup ? xss(body.patient.bloodGroup) : undefined,
          allergies: body.patient.allergies ? xss(body.patient.allergies) : undefined,
          conditions: body.patient.conditions ? xss(body.patient.conditions) : undefined,
        },
        contacts,
        aiMedicalAnalysis: body.aiMedicalAnalysis,
        recommendedHospitals: body.recommendedHospitals,
      }, req.header("idempotency-key") || undefined);
      res.status(201).json({ incident: publicView(incident), warnings: contacts.length === 0 ? ["NO_VALID_CONTACTS"] : [] });
    } catch (e: any) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", issues: e.issues });
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  router.get("/api/incidents/:id", async (req, res) => {
    const incident = await store.get(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    const token = req.header("x-device-token");
    if (token !== incident.deviceToken) return res.status(403).json({ error: "Not the owning device" });
    res.json({ incident: publicView(incident) });
  });

  router.post("/api/incidents/:id/dispatch", requireOwner, async (req, res) => {
    const incident: Incident = (req as any).incident;
    try {
      await engine.dispatch(incident, publicBaseUrl(req));
      const sent = incident.deliveries.filter(d => d.status !== "failed").length;
      res.json({
        incident: publicView(incident),
        summary: { total: incident.deliveries.length, sent, failed: incident.deliveries.length - sent, allFailed: incident.deliveries.length > 0 && sent === 0 },
      });
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message, incident: publicView(incident) });
    }
  });

  router.post("/api/incidents/:id/cancel", requireOwner, async (req, res) => {
    try { res.json({ incident: publicView(await engine.cancel((req as any).incident, xss(req.body?.note || "Cancelled by user"))) }); }
    catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
  });

  router.post("/api/incidents/:id/close", requireOwner, async (req, res) => {
    try { res.json({ incident: publicView(await engine.close((req as any).incident)) }); }
    catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
  });

  router.post("/api/incidents/:id/location", requireOwner, async (req, res) => {
    const incident: Incident = (req as any).incident;
    try {
      const body = z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracyM: z.number().optional(),
        speedMps: z.number().optional(),
      }).parse(req.body);

      incident.location = { lat: body.lat, lng: body.lng, accuracyM: body.accuracyM };
      if (!incident.locationHistory) incident.locationHistory = [];
      incident.locationHistory.push({ lat: body.lat, lng: body.lng, accuracyM: body.accuracyM, speedMps: body.speedMps, at: Date.now() });
      incident.updatedAt = Date.now();

      await store.save(incident);
      io?.emit("incident:update", publicView(incident));
      io?.to(`incident:${incident.id}`).emit("incident:update", publicView(incident));

      res.json({ status: "ok" });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get("/api/incidents/:id/report.pdf", async (req, res) => {
    const incident = await store.get(req.params.id);
    if (!incident) return res.status(404).send("Report not found");
    const t = String(req.query.t || "");
    const ok = t.length === incident.reportToken.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(incident.reportToken));
    if (!ok) return res.status(403).send("Invalid report link");
    // Reports expire 24 h after the incident is closed/cancelled; open incidents stay reachable.
    if ((incident.state === "CLOSED" || incident.state === "CANCELLED") && Date.now() - incident.updatedAt > 24 * 3600 * 1000) {
      return res.status(410).send("Report expired");
    }
    try {
      const pdf = await renderIncidentPdf(incident);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store");
      res.send(pdf);
    } catch (e: any) {
      res.status(500).send("Could not render report");
    }
  });

  // ── Twilio webhooks (signature-validated in production) ──
  router.post("/api/twilio/incidents/:id/gather", twilioGuard, async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
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

  router.post("/api/twilio/incidents/:id/status", twilioGuard, async (req, res) => {
    const incident = await store.get(req.params.id);
    if (incident) {
      const channel = (req.query.channel === "call" ? "call" : "sms") as Channel;
      const sid = req.body?.MessageSid || req.body?.CallSid;
      const status = req.body?.MessageStatus || req.body?.CallStatus || "";
      await engine.updateDeliveryStatus(incident, channel, sid, status);
    }
    res.sendStatus(204);
  });

  /** Inbound SMS reply ("1", "yes", "coming"…) → acknowledge the latest open incident for that responder. */
  router.post("/api/twilio/sms", twilioGuard, async (req, res) => {
    const body = String(req.body?.Body || "").toLowerCase().trim();
    const from = String(req.body?.From || "");
    const twiml = new twilio.twiml.MessagingResponse();
    const confirms = body === "1" || /\b(yes|ok|okay|confirm|coming|on my way|en route|responding|ack)\b/.test(body);
    const incident = from ? await store.findOpenByContact(from) : undefined;
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

  // Socket rooms: clients join their incident to receive incident:update pushes.
  io?.on("connection", (socket) => {
    socket.on("incident:join", (incidentId: string) => {
      if (typeof incidentId === "string" && incidentId.length < 64) socket.join(`incident:${incidentId}`);
    });
    socket.on("incident:leave", (incidentId: string) => {
      if (typeof incidentId === "string") socket.leave(`incident:${incidentId}`);
    });
  });

  return router;
}
