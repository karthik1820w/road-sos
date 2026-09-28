/**
 * Client side of the incident engine (Feature 2).
 *
 * Responsibilities
 *  - own the device token that proves ownership of an incident
 *  - normalise/validate emergency contacts (India-first E.164)
 *  - create → dispatch → observe an incident over HTTP + Socket.IO
 *  - when the API is unreachable or every channel failed, fall back to the
 *    phone's own SMS composer and a 112 dial — the alert must leave the device
 *  - queue incidents created offline and replay them when connectivity returns
 */
import { io, Socket } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';
import { EmergencyFallback, type EmergencyFallbackPlugin } from './emergencyFallbackPlugin';

export type IncidentState = 'DETECTED' | 'PROBING' | 'DISPATCHED' | 'ACKED' | 'CLOSED' | 'CANCELLED';
export type IncidentKind = 'CRASH' | 'MANUAL_SOS' | 'SAFETY_WORD' | 'VOICE_HELP' | 'MEDICAL';

export interface Delivery {
  id: string;
  channel: 'sms' | 'call';
  to: string;
  status: 'queued' | 'sent' | 'delivered' | 'answered' | 'failed' | 'no_answer';
  attempts: number;
  error?: string;
  updatedAt: number;
}

export interface AiMedicalAnalysis {
  condition: string;
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'MILD';
  possibleDiseasesOrInjuries: string[];
  firstAidInstructions: string[];
  specialtiesNeeded: string[];
  triageSummary: string;
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

export interface IncidentLocationHistoryEntry {
  lat: number;
  lng: number;
  accuracyM?: number;
  speedMps?: number;
  at: number;
}

export interface Incident {
  id: string;
  kind: IncidentKind;
  state: IncidentState;
  reason: string;
  createdAt: number;
  updatedAt: number;
  location?: { lat: number; lng: number; accuracyM?: number };
  locationHistory?: IncidentLocationHistoryEntry[];
  address?: string;
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  patient: { name: string; phone?: string; bloodGroup?: string; allergies?: string; conditions?: string };
  contacts: string[];
  deliveries: Delivery[];
  ack?: { by: string; at: number; via: string };
  history: { state: IncidentState; at: number; note?: string }[];
  aiMedicalAnalysis?: AiMedicalAnalysis;
  recommendedHospitals?: RecommendedHospital[];
}

export interface CreateIncidentInput {
  kind: IncidentKind;
  reason: string;
  location?: { lat: number; lng: number; accuracyM?: number } | null;
  address?: string;
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  sensorSummary?: Record<string, number | string | boolean>;
  patient: Incident['patient'];
  contacts: string[];
  aiMedicalAnalysis?: AiMedicalAnalysis;
  recommendedHospitals?: RecommendedHospital[];
}

export interface DispatchSummary { total: number; sent: number; failed: number; allFailed: boolean }
export interface DispatchOutcome {
  incident: Incident | null;
  summary: DispatchSummary | null;
  /** True when the phone's own SMS/dialer was opened because the server path failed. */
  usedNativeFallback: boolean;
  /** The alert text to send manually when no automatic channel worked (always set on failure). */
  fallbackText?: string;
  error?: string;
}

// ───────────── device identity ─────────────

const TOKEN_KEY = 'roadsos_device_token';
export function getDeviceToken(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) { t = crypto.randomUUID(); localStorage.setItem(TOKEN_KEY, t); }
    return t;
  } catch {
    return 'ephemeral-' + Math.random().toString(36).slice(2);
  }
}

const headers = () => ({ 'Content-Type': 'application/json', 'X-Device-Token': getDeviceToken() });

// ───────────── contacts ─────────────

export function normalizePhone(raw: string): string | null {
  const t = (raw || '').replace(/[^\d+]/g, '');
  if (!t) return null;
  let e164 = t;
  if (!t.startsWith('+')) {
    if (/^0\d{10}$/.test(t)) e164 = `+91${t.slice(1)}`;
    else if (/^\d{10}$/.test(t)) e164 = `+91${t}`;
    else if (/^91\d{10}$/.test(t)) e164 = `+${t}`;
    else e164 = `+${t}`;
  }
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** Valid, de-duplicated E.164 contacts from the medical profile. Never invents a fallback number. */
export function contactsFromProfile(medicalInfo: { emergencyContacts?: { number: string }[] } | null | undefined): string[] {
  const out = new Set<string>();
  for (const c of medicalInfo?.emergencyContacts || []) {
    const n = normalizePhone(c.number);
    if (n) out.add(n);
  }
  return [...out];
}

// ───────────── API ─────────────

export async function createIncident(input: CreateIncidentInput, idempotencyKey?: string): Promise<{ incident: Incident; warnings: string[] }> {
  const res = await fetch('/api/incidents', {
    method: 'POST',
    headers: { ...headers(), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify({ ...input, location: input.location || undefined }),
  });
  if (!res.ok) throw new Error((await safeJson(res))?.error || `Create failed (${res.status})`);
  return res.json();
}

export async function dispatchIncident(id: string): Promise<{ incident: Incident; summary: DispatchSummary }> {
  const res = await fetch(`/api/incidents/${id}/dispatch`, { method: 'POST', headers: headers() });
  const data = await safeJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || `Dispatch failed (${res.status})`), { code: data?.error, incident: data?.incident });
  return data;
}

export async function cancelIncident(id: string, note?: string) {
  const res = await fetch(`/api/incidents/${id}/cancel`, { method: 'POST', headers: headers(), body: JSON.stringify({ note }) });
  return safeJson(res);
}

export async function closeIncident(id: string) {
  const res = await fetch(`/api/incidents/${id}/close`, { method: 'POST', headers: headers() });
  return safeJson(res);
}

export async function updateIncidentLocation(id: string, lat: number, lng: number, accuracyM?: number, speedMps?: number) {
  const res = await fetch(`/api/incidents/${id}/location`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ lat, lng, accuracyM, speedMps }),
  });
  return safeJson(res);
}

export async function getIncident(id: string): Promise<Incident | null> {
  const res = await fetch(`/api/incidents/${id}`, { headers: headers() });
  if (!res.ok) return null;
  return (await res.json()).incident;
}

async function safeJson(res: Response) { try { return await res.json(); } catch { return null; } }

// ───────────── live updates ─────────────

let socket: Socket | null = null;
export function getSocket() {
  if (!socket) socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: Infinity });
  return socket;
}

/** Subscribe to incident pushes; also polls every 4 s as a fallback while the incident is open. */
export function observeIncident(id: string, onUpdate: (incident: Incident) => void): () => void {
  const s = getSocket();
  const handler = (inc: Incident) => { if (inc?.id === id) onUpdate(inc); };
  s.emit('incident:join', id);
  s.on('incident:update', handler);
  const rejoin = () => s.emit('incident:join', id);
  s.on('connect', rejoin);

  let stopped = false;
  const poll = async () => {
    if (stopped) return;
    const inc = await getIncident(id).catch(() => null);
    if (inc) onUpdate(inc);
    if (!stopped && inc && (inc.state === 'DISPATCHED' || inc.state === 'PROBING' || inc.state === 'DETECTED')) setTimeout(poll, 4000);
  };
  setTimeout(poll, 4000);

  return () => {
    stopped = true;
    s.off('incident:update', handler);
    s.off('connect', rejoin);
    s.emit('incident:leave', id);
  };
}

export function observeDrivingMode(
  onForcedOff: (data: { userId?: string; active: boolean; reason: string }) => void,
  onChanged?: (data: { userId?: string; active: boolean; userName?: string; phone?: string }) => void,
): () => void {
  const s = getSocket();
  const token = getDeviceToken();
  s.emit('user:join', token);
  s.on('driving_mode:forced_off', onForcedOff);
  if (onChanged) s.on('driving_mode:changed', onChanged);

  const rejoin = () => s.emit('user:join', token);
  s.on('connect', rejoin);

  return () => {
    s.off('driving_mode:forced_off', onForcedOff);
    if (onChanged) s.off('driving_mode:changed', onChanged);
    s.off('connect', rejoin);
    s.emit('user:leave', token);
  };
}

// ───────────── native fallback ─────────────

export function buildFallbackSms(input: CreateIncidentInput) {
  const who = input.patient.name || 'RoadSOS user';
  const loc = input.location ? `https://www.google.com/maps?q=${input.location.lat.toFixed(6)},${input.location.lng.toFixed(6)}` : 'location unavailable';
  return `ROADSOS ALERT: ${who} needs help (${input.kind.replace('_', ' ').toLowerCase()}). ${input.address ? input.address + ' ' : ''}${loc}. Blood: ${input.patient.bloodGroup || '?'}. Call back or dial 112.`;
}

const isMobileDevice = () => {
  try { if (Capacitor.isNativePlatform()) return true; } catch { /* ignore */ }
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

/** Trigger a URL-scheme handler (sms:, tel:) without navigating the app away on desktop browsers. */
export function openScheme(url: string) {
  if (!isMobileDevice()) { console.info('[Incident] skipped scheme on desktop:', url); return; }
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

/**
 * Open the phone's SMS composer pre-filled for the contacts, then the dialer for 112.
 * Works in mobile browsers and in the Capacitor shell without any plugin. On desktop
 * browsers (no SMS/tel handlers) nothing is opened — the caller shows the message text
 * instead. Returns true if a composer was opened.
 */
export function openNativeFallback(input: CreateIncidentInput, opts: { dial112?: boolean } = {}): boolean {
  if (!isMobileDevice()) return false;
  const body = encodeURIComponent(buildFallbackSms(input));
  const targets = input.contacts;
  let opened = false;
  try {
    if (targets.length) {
      // Android accepts comma-separated recipients; iOS accepts a single number reliably.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const to = isIOS ? targets[0] : targets.join(',');
      openScheme(`sms:${to}${isIOS ? '&' : '?'}body=${body}`);
      opened = true;
    }
    if (opts.dial112 !== false) {
      setTimeout(() => openScheme('tel:112'), targets.length ? 2500 : 0);
    }
  } catch (e) {
    console.warn('[Incident] native fallback failed', e);
  }
  return opened;
}

// ───────────── offline queue ─────────────

const QUEUE_KEY = 'roadsos_pending_incidents';
interface Pending { input: CreateIncidentInput; key: string; at: number }

function readQueue(): Pending[] { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } }
function writeQueue(q: Pending[]) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* ignore */ } }

export function queuePendingIncident(input: CreateIncidentInput, key: string) {
  const q = readQueue();
  q.push({ input, key, at: Date.now() });
  writeQueue(q);
}

/** Replay queued incidents (called on `online`). Incidents older than 2 h are dropped as stale. */
export async function flushPendingIncidents(onFlushed?: (incident: Incident) => void) {
  const q = readQueue().filter(p => Date.now() - p.at < 2 * 3600 * 1000);
  const remaining: Pending[] = [];
  for (const p of q) {
    try {
      const { incident } = await createIncident({ ...p.input, reason: `${p.input.reason} (sent late: created offline at ${new Date(p.at).toLocaleTimeString()})` }, p.key);
      const out = await dispatchIncident(incident.id);
      onFlushed?.(out.incident);
    } catch {
      remaining.push(p);
    }
  }
  writeQueue(remaining);
  return { flushed: q.length - remaining.length, remaining: remaining.length };
}

// ───────────── one-call orchestration ─────────────

/**
 * Attempt genuinely automatic native fallback (zero-tap background SMS + sequential auto-dial).
 * 
 * Note on iOS:
 * Apple's platform strictly prohibits apps from sending SMS messages programmatically or placing
 * direct phone calls without explicit user interaction (tap). Therefore, zero-tap background
 * fallback is structurally impossible on iOS and is strictly an Android-only capability.
 */
export async function attemptAutomaticNativeFallback(
  input: CreateIncidentInput,
  plugin: EmergencyFallbackPlugin,
  speakFn: (msg: string) => void
): Promise<boolean> {
  if (!isMobileDevice() || !Capacitor.isNativePlatform()) return false;
  // iOS cannot send SMS or place calls silently by design
  if (Capacitor.getPlatform() === 'ios') return false;

  const contacts = [...input.contacts];
  const isDanger = input.kind === 'MANUAL_SOS' || input.kind === 'SAFETY_WORD';
  const officialNum = isDanger
    ? (import.meta.env.VITE_POLICE_NUMBER || '112')
    : (import.meta.env.VITE_HOSPITAL_NUMBER || '112');

  if (officialNum && !contacts.includes(officialNum)) {
    contacts.unshift(officialNum);
  }

  if (contacts.length === 0) return false;

  speakFn("Sending automatic emergency messages now");

  const body = buildFallbackSms(input);
  try {
    await plugin.sendEmergencySms({ contacts, body });
    await plugin.dialEmergencySequence({ numbers: contacts, perCallTimeoutMs: 15000 });
    return true;
  } catch (e: unknown) {
    console.warn("Automatic native fallback failed or rejected", e);
    return false; // usually due to permission denied or unexpected error
  }
}

function speakHelper(msg: string) {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(msg));
  }
}

/**
 * Create + dispatch an incident with every fallback tier applied in strict order:
 *  Tier 1: Cloud/Twilio dispatch via backend
 *  Tier 2: Automatic native cellular SMS + sequential auto-call (zero-tap)
 *  Tier 3: User-assisted openNativeFallback (tap-required) as final safety net
 */
export async function raiseIncident(input: CreateIncidentInput, opts: { idempotencyKey?: string; allowNativeFallback?: boolean } = {}): Promise<DispatchOutcome> {
  const key = opts.idempotencyKey || crypto.randomUUID();
  const allowNative = opts.allowNativeFallback !== false;

  const triggerFallbackLoudly = async (reason: string, details: string, fallbackInput = input) => {
    console.error(`[NATIVE FALLBACK TRIGGERED] Reason: ${reason}. Details: ${details}`);
    if (allowNative) {
      const automaticSuccess = await attemptAutomaticNativeFallback(fallbackInput, EmergencyFallback, speakHelper);
      if (automaticSuccess) {
        return true;
      }
      
      if (typeof window !== 'undefined') {
        alert(`🚨 EMERGENCY DISPATCH FALLBACK ACTIVATED 🚨\n\nReason: ${reason}\n\n${details}\n\nOpening your phone's native SMS/dialer as a last resort.`);
      }
      return openNativeFallback(fallbackInput);
    }
    return false;
  };

  if (!navigator.onLine) {
    queuePendingIncident(input, key);
    const used = await triggerFallbackLoudly('OFFLINE', 'The device has no internet connection. The request has been queued.');
    return { incident: null, summary: null, usedNativeFallback: used, fallbackText: buildFallbackSms(input), error: 'OFFLINE' };
  }

  let incident: Incident | null = null;
  try {
    const created = await createIncident(input, key);
    incident = created.incident;
    if (created.warnings.includes('NO_VALID_CONTACTS')) {
      const used = await triggerFallbackLoudly('NO_VALID_CONTACTS', 'The server responded successfully, but there were no valid contacts provided to send to.', { ...input, contacts: [] });
      return { incident, summary: null, usedNativeFallback: used, fallbackText: buildFallbackSms(input), error: 'NO_CONTACTS' };
    }
    const out = await dispatchIncident(incident.id);
    incident = out.incident;
    if (out.summary.allFailed) {
      const reason = incident.deliveries.find((d: Delivery) => d.status === 'failed')?.error || 'ALL_CHANNELS_FAILED';
      const used = await triggerFallbackLoudly('ALL_CHANNELS_FAILED', `Twilio API calls were attempted but rejected: ${reason}`);
      return { incident, summary: out.summary, usedNativeFallback: used, fallbackText: buildFallbackSms(input), error: reason };
    }
    return { incident, summary: out.summary, usedNativeFallback: false };
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string; incident?: Incident };
    console.error('[Incident] raise failed:', err?.message);
    if (!incident) queuePendingIncident(input, key);
    const used = await triggerFallbackLoudly('SERVER_UNREACHABLE', `The request to /api/incidents failed entirely: ${err?.message || 'UNKNOWN ERROR'}`);
    return { incident: err?.incident || incident, summary: null, usedNativeFallback: used, fallbackText: buildFallbackSms(input), error: err?.code || err?.message || 'UNKNOWN' };
  }
}
