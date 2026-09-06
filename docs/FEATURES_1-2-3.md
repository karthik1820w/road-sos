# Features 1–3: what was built, how it works, how to demo it

This change set upgrades the three core safety features of Road-SoS from prototype to a
product-grade architecture. Everything below is in the repo and covered by tests
(`npm test` → 27 tests, `npm run lint` now type-checks `api/` as well as `src/`).

## Feature 1 — Sensor-fusion crash detection (`src/safety/crashDetector.ts`)

**Before:** `if (g > 8) probe; if (g > 12) dispatch` on raw accelerometer magnitude. Fired on
phone drops, never fired on phones that saturate below 12 g, ran only while the tab was visible.

**Now:**

```
accel + gyro (hardwareService.watchMotion) ─┐
GPS speed (hardwareService.watchLocation) ──┼─► CrashDetector (20 s ring buffer)
                                            │      candidate when |a| ≥ 3.2 g
                                            │      wait 2.5 s → extract features → CrashModel.score()
                                            └─► verdict {score, confidence, probeTimeoutS, features}
```

Features scored: peak g, impact duration, jerk, **pre-impact free-fall** (phone-drop signature,
negative weight), **post-impact stillness**, orientation change, gyro burst, **GPS speed collapse**,
and **driving context** (DRIVING / STATIONARY / UNKNOWN from the last 30 s of GPS speed). The
default `HeuristicCrashModel` is a logistic model with documented weights so the behaviour can be
explained to judges; `createCrashModel(predictFn)` lets you drop in an ONNX/TFLite model trained on
real IMU data without touching the pipeline.

Verdict → app flow (`App.tsx`):

| confidence | action |
|---|---|
| NONE | nothing |
| LOW | logged to Accident Logs only |
| MEDIUM | "Are you okay?" probe, **20 s** to answer |
| HIGH | "Are you okay?" probe, **10 s** to answer |

No answer, or "I need help" → an incident of kind `CRASH` is raised with `confidence` and a
`sensorSummary` (peak g, speed before/after, stillness…) that ends up in the SMS and the PDF.
"I am okay" / "cancel" / "safe" cancels the probe.

The **Telemetry** page shows the last impact analysis (score, peak g, free-fall, stillness, speed
before→after, context). The **Rapid Response** page's *Replay recorded crash signature* button runs
a recorded 60 km/h → 0 crash trace through `CrashDetector.runRecorded()` — the real detector, not a
shortcut — so the demo exercises exactly the production path. Tests in
`tests/crashDetector.test.ts` cover: real crash → HIGH, stationary phone drop → NONE/LOW, pothole
while driving → NONE/LOW, no-GPS spike → never HIGH, cooldown, black-box snapshot.

Background operation: `src/services/backgroundService.ts` enables an Android **foreground service**
when `@anuradev/capacitor-background-mode` is installed (`npm i @anuradev/capacitor-background-mode
&& npx cap sync`), otherwise a Screen Wake Lock on the web. `AndroidManifest.xml` now declares
`FOREGROUND_SERVICE*`, `ACCESS_BACKGROUND_LOCATION`, `POST_NOTIFICATIONS`, `WAKE_LOCK`,
`SEND_SMS`, `CALL_PHONE`. Settings shows which mode is active.

## Feature 2 — Incident engine (`api/incidents.ts`, `src/services/incidentService.ts`)

**Before:** three near-identical client functions posted to `/api/sos/notify`, `/api/sos/call-initiate`
and `/api/sos/send-report` with hard-coded fallback phone numbers, the name "BOB", one global
"confirmed" flag for all users, and Twilio trial-account errors returned as `success: true`.

**Now:** every SOS is an **Incident** with a state machine

```
DETECTED ─► PROBING ─► DISPATCHED ─► ACKED ─► CLOSED
    └──────────┴────────────┴──► CANCELLED
```

* `POST /api/incidents` (header `X-Device-Token`, optional `Idempotency-Key`) creates it with
  patient card, contacts (normalised to E.164, India default +91), location, address, confidence,
  sensor summary. No contacts → `warnings: ["NO_VALID_CONTACTS"]`, never an invented number.
* `POST /api/incidents/:id/dispatch` fans out per contact: **SMS** (location link + medical-card
  link + "reply 1") then **voice call** (TwiML `<Gather>`, "press 1"). Each channel is a `Delivery`
  row with `attempts`, `status`, `sid`, `error`. Transient Twilio errors retry ×3 with backoff;
  auth/trial/invalid-number errors fail immediately **and are reported as failed**. Response
  includes `summary: {total, sent, failed, allFailed}`.
* Twilio **status callbacks** (`/api/twilio/incidents/:id/status`) update rows to
  delivered / answered / no_answer / failed. **Keypress** (`/api/twilio/incidents/:id/gather`) and
  **SMS reply** (`/api/twilio/sms`, matched to the latest open incident for that number) move the
  incident to `ACKED` with who/when/how.
* All webhooks are signature-validated (`twilio.webhook`) in production or when
  `TWILIO_VALIDATE_WEBHOOKS=true`; set `PUBLIC_BASE_URL` when behind ngrok/proxy.
* One **PDF handover report per incident** (pdfkit) with a **QR code** of the live map link, served
  from `/api/incidents/:id/report.pdf?t=<HMAC token>` — the token is in the SMS, nothing else can
  fetch it. Reports of closed incidents expire after 24 h.
* Live updates: clients `incident:join` a Socket.IO room and receive `incident:update`; the client
  also polls every 4 s as a fallback.
* Ownership: mutating routes require the creating device's token (403 otherwise).
* Persistence: `MemoryIncidentStore` by default; with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  every write is mirrored to the `incidents` table (`supabase/schema.sql`).

Client (`raiseIncident()`) applies the fallbacks that make this an emergency product:

| situation | behaviour |
|---|---|
| offline | incident queued in `localStorage`, replayed on `online`; phone's SMS composer + 112 dialer opened (mobile) |
| no contacts | 112 dialer opened, UI tells the user to add contacts |
| server error / every channel failed | incident still recorded; SMS composer + 112 opened on mobile; on desktop the alert text is shown with a Copy button |

The home screen shows a live **incident panel**: state, per-channel delivery status, the failure
reason, "False alarm" (→ CANCELLED) and "Close". The "Help is coming" banner now names who
acknowledged and how. `VoiceInterface` shows the same delivery table instead of a static
"✓ ALERT SENT" and no longer has a "simulate confirmation" button.

Legacy routes removed: `/api/sos/*`, `/api/emergencies/*`, `/api/twilio/call-gather`,
`/api/twilio/call-neon-gather`, `/api/report/:id.pdf`, and the broken `/api/traffic-updates`.

## Feature 3 — Silent safety word (`src/safety/wakeWord.ts`)

**Before:** fixed word "NEON" matched by `/(neon|leon|ne on|knee on|nian|beyond|new one|nyon)/`
over a 20 s rolling transcript, interim and final results double-counted, three competing
recognizer restart loops.

**Now:**

* `SafetyWordMatcher` — exact token matching (plus user-enrolled aliases), N=3 hits in an 8 s
  window, **utterances longer than 4 non-target words are ignored** (a code word is said on its
  own; "I saw a neon sign" does not count), interim results never double-count the final, resets
  after a trigger. Unit-tested (`tests/safetyWord.test.ts`).
* The word is **user-configurable** in Settings (validated: 1–2 words, 3–12 letters, not a command
  or panic word). Stored in `localStorage` as `roadsos_safety_word`.
* Trigger raises a `SAFETY_WORD` incident **silently** (no overlay, no speech) → SMS + call to
  contacts; the guardian's acknowledgement arrives as a vibration pattern.
* Engines: `WebSpeechWakeWordEngine` has a single supervised restart with backoff and stops
  restarting when the microphone is denied. `PorcupineWakeWordEngine` runs **offline on-device**
  via Picovoice Porcupine (WASM) when `VITE_PICOVOICE_ACCESS_KEY` and `VITE_SAFETY_KEYWORD_PATH`
  are set (`npm i @picovoice/porcupine-web @picovoice/web-voice-processor`, train the keyword at
  console.picovoice.ai, put the `.ppn` and `porcupine_params.pv` under `public/wake/`). Both engines
  can run at once; Settings shows which is active.

## Other fixes made because these features depend on them

* `tsconfig.json` now includes `api/` and `tests/` — 24 hidden backend type errors fixed.
* Server boots without Supabase (`api/auth.ts` is lazy; auth routes mount only when configured).
* `/api/health` is unauthenticated, returns configured-integration flags; the old duplicate route
  that shadowed it is gone.
* `vite.config.ts` no longer maps `GEMINI_API_KEY` into the client bundle.
* `main.tsx` no longer suppresses `console.error`/`NotAllowedError` (mic/GPS denials are visible).
* `SOSTrigger`: `onTouchCancel` handled, hold interval cleared on unmount, countdown no longer
  restarts on parent re-render, button resets after firing.
* `PermissionsModal` records the real permission result instead of "granted" on failure; phone is
  normalised to E.164.
* All hard-coded personal phone numbers and "BOB" removed from `App.tsx`, `VoiceInterface.tsx`,
  `api/index.ts`. Default medical profile has no contacts and no name.
* Tests that tested their own inline helpers were replaced by tests against real modules.

## Environment

```
TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER   required for real SMS/calls
PUBLIC_BASE_URL          https origin Twilio can reach (ngrok in dev) — callbacks, report links
TWILIO_VALIDATE_WEBHOOKS true|false (default: true in production)
INCIDENT_SIGNING_SECRET  HMAC secret for report links (falls back to JWT_SECRET)
GOOGLE_MAPS_BROWSER_KEY  referrer-restricted browser key (server key stays private)
SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY   optional persistence (run supabase/schema.sql)
VITE_PICOVOICE_ACCESS_KEY + VITE_SAFETY_KEYWORD_PATH   optional offline wake word
```

Twilio console: point the number's **Messaging webhook** to `${PUBLIC_BASE_URL}/api/twilio/sms`.
Call/status webhooks are passed per call, nothing else to configure.

## Demo script (all real)

1. Settings → set a safety word, confirm contacts count > 0 (Medical Profile → add the judge's number).
2. Telemetry → drop the phone on the table: no probe (drop rejected). Rapid Response → *Replay
   recorded crash signature*: "Are you okay?" appears with `HIGH confidence · 6.8 g · driving`.
3. Stay silent 10 s → incident raised; home shows `CRASH · DISPATCHED` with SMS/CALL rows turning
   `sent → delivered / answered`. Judge's phone gets the SMS (map + medical-card QR link) and the call.
4. Judge presses 1 → app vibrates, banner "HELP IS COMING — +91… confirmed via call keypress".
5. Say the safety word three times on its own → no UI change; judge gets a "silent distress" SMS.
6. Turn off Wi-Fi → hold SOS → messages app opens with the alert; reconnect → incident replays.

## Not in this change (next)

Trained ONNX crash model on collected IMU data (interface is ready); Bhashini/Indian-language
voice; hospital ranking with real capacity data (the map's "Nearest Hospitals (Offline Mode)"
cards are still fabricated and should be removed before the demo); per-user Driving Mode;
guardian web console; 112 ERSS API integration (currently `tel:112` deep link).
