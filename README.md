# Road SOS: Intelligent Road Safety & Travel Assistant

Road SOS is a cutting-edge PWA (Progressive Web App) designed to enhance safety, convenience, and emergency response for commuters on Indian roads. It leverages native device capabilities, real-time intelligence, and deep AI integrations to provide an end-to-end travel experience.

## 🚀 Key Features

- **PWA & Voice Control Ecosystem**: Voice-activated, background-running assistant supporting conversational interactions. Say "Hello", "Refresh", "Get traffic updates", or ask general questions completely hands-free.
- **AI Road SOS Assistant Modal**: A powerful, contextual Gemini-driven chatbot responding naturally with low latency for traffic queries, road rules, and general knowledge.
- **AI Chatbot Navigation Commands**: Voice-based turn-by-turn navigation (e.g., "Navigate to Malleswaram") leveraging OSRM and geocoding, spoken through the AI assistant.
- **Location & Traffic Data**: Integrated with Geoapify to provide live traffic incident monitoring, and dynamically update Google Maps routing based on current delays and congestion.
- **Smart Driving Mode & Realtime Call Forwarding**: Engage driving mode via voice or UI to handle incoming calls in real time with Twilio webhooks, politely auto-replying with an automated voice to callers ("[Driver Name] is currently operating a vehicle and will reach out to you later.") while you concentrate on the road, with automatic safety deactivation during any emergency.
- **Nearest Medical Rescue & Dispatch**: Integrates Google Places API and routing algorithms to automatically identify, display, and call the fastest available medical center directly based on ETA.
- **Intelligent First Aid Voice Guide**: The background mic activates upon hearing "First Aid". Wait, speak your symptoms fully, and receive an instant, accurate medical guidance step based on Gemini responses.
- **Sensor-Fusion Crash Detection**: On-device classifier over accelerometer, gyroscope and GPS speed (impact energy, free-fall rejection, post-impact stillness, speed collapse, driving context). Confidence-graded "Are you okay?" probe (10 s / 20 s) before any alert is sent. See `docs/FEATURES_1-2-3.md`. NOTE: iOS explicitly severely limits background operation without native audio sessions; background crash detection and wake word are fully reliable on Android only.
- **Incident Engine**: Every SOS is an incident with a state machine (Detected → Probing → Dispatched → Acked → Closed), per-contact SMS + voice call with retries and real Twilio delivery status, press-1 / reply-1 acknowledgement pushed live to the victim, one signed PDF medical handover with QR per incident, offline queue and native SMS/112 fallback.
- **Silent Safety Word**: User-chosen code word, strict matching (no sound-alikes, isolated utterances only), silent dispatch to contacts. Runs on Web Speech today and on-device/offline via Picovoice Porcupine when configured.
- **Voice System Lifecycle Management**: Issue graceful commands such as *"Shutdown the application"* to temporarily suspend tracking, and *"Wakeup the application"* to seamlessly revive background recognition pipelines and monitoring without needing to touch the screen.

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Recharts, Framer Motion.
- **Backend / Services**: Express, `@google/genai` (Gemini AI), Twilio API (SMS / Voice calling webhook), Google Maps Library (`@vis.gl/react-google-maps`).
- **Geolocation APIs**: Google Places API, Google Routes API, Geoapify (Traffic incident webhooks).
- **Native APIs**: Web Speech API (`SpeechRecognition`, `speechSynthesis`), Geolocation API, DeviceMotion API.

## 📋 Setup & Configuration

Create a `.env` file in the root directory:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_FROM_NUMBER=your_twilio_number

# Google Workspace / Gemini
GEMINI_API_KEY=your_gemini_api_key

# Maps Platform
GOOGLE_MAPS_PLATFORM_KEY=your_google_maps_key
VITE_GOOGLE_MAPS_PLATFORM_KEY=your_google_maps_key

# Geoapify
GEOAPIFY_API_KEY=your_geoapify_key

# Incident engine (see docs/FEATURES_1-2-3.md for the full list)
PUBLIC_BASE_URL=https://your-public-https-origin
INCIDENT_SIGNING_SECRET=your_signing_secret_for_production # REQUIRED in production to sign medical reports
```

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server (runs with Vite + Express concurrently in our build setup):
   ```bash
   npm run dev
   ```
3. To package for production:
   ```bash
   npm run build
   ```

### Picovoice Porcupine Setup (Offline Safety Word)
To enable the offline on-device safety word detection engine:
1. Obtain an access key from the [Picovoice Console](https://console.picovoice.ai/).
2. Train a custom wake word model (.ppn file) for Web (WASM) target.
3. Place the `.ppn` file in `public/wake/` (e.g., `public/wake/neon_wasm.ppn`).
4. Set the environment variables in `.env`:
   ```env
   VITE_PICOVOICE_ACCESS_KEY=your_access_key
   VITE_SAFETY_KEYWORD_PATH=/wake/neon_wasm.ppn
   ```
If these are not configured, the app seamlessly falls back to the online Web Speech API.

## 🚨 Emergency Protocols

### Fallback Watchdogs & Background Monitor
The application implements persistent watchdogs to continuously keep background listeners active where supported, intercepting keywords robustly even in noisy situations.

### Hands-Free Rescue System
1. Detect anomaly (Manual, Crash, or Keyword).
2. Voice Probe verification.
3. Geo-location mapping and shortest-path computation for nearest emergency trauma centers.
4. Auto-dial out to predefined contacts or responders using Twilio Voice proxy.

---
Built with ❤️ for intelligent safety.

### Android Release Build Setup
To build the Android app for production or testing locally, you must generate a keystore and configure it. Do not commit this keystore to the repository. CI uses a separate, securely-stored release keystore.

1. Generate a keystore:
   `ash
   keytool -genkeypair -v -keystore release.keystore -alias your_alias_name -keyalg RSA -keysize 2048 -validity 10000
   ``n2. Create a file named keystore.properties in the root of the project with the following:
   `properties
   storePassword=your_store_password
   keyPassword=your_key_password
   keyAlias=your_alias_name
   storeFile=../release.keystore
   ``n3. This file and the keystore are automatically ignored by git. Capacitor will now sign your release builds when running ./gradlew assembleRelease.

### CI/CD for Android Release
The GitHub Action \Android Release Build\ handles building the APK and AAB. It is triggered manually via \workflow_dispatch\ or when pushing a version tag (e.g., \1.0.0\). The \ersionCode\ is automatically derived from the CI \GITHUB_RUN_NUMBER\, ensuring it strictly increases with every build.

