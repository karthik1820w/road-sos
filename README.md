# Road SOS: Intelligent Road Safety & Travel Assistant

Road SOS is a cutting-edge PWA (Progressive Web App) designed to enhance safety, convenience, and emergency response for commuters on Indian roads. It leverages native device capabilities, real-time intelligence, and deep AI integrations to provide an end-to-end travel experience.

## 🚀 Key Features

- **PWA & Voice Control Ecosystem**: Voice-activated, background-running assistant supporting conversational interactions. Say "Hello", "Refresh", "Get traffic updates", or ask general questions completely hands-free.
- **AI Road SOS Assistant Modal**: A powerful, contextual Gemini-driven chatbot responding naturally with low latency for traffic queries, road rules, and general knowledge.
- **AI Chatbot Navigation Commands**: Voice-based turn-by-turn navigation (e.g., "Navigate to Malleswaram") leveraging OSRM and geocoding, spoken through the AI assistant.
- **Location & Traffic Data**: Integrated with Geoapify to provide live traffic incident monitoring, and dynamically update Google Maps routing based on current delays and congestion.
- **Smart Driving Mode & Realtime Call Forwarding**: Engage driving mode via voice to handle incoming calls in realtime with Twilio webhooks, politely auto-replying with an automated voice to callers ("Bob is driving and will reach to you later.") while you concentrate on the road.
- **Nearest Medical Rescue & Dispatch**: Integrates Google Places API and routing algorithms to automatically identify, display, and call the fastest available medical center directly based on ETA.
- **Intelligent First Aid Voice Guide**: The background mic activates upon hearing "First Aid". Wait, speak your symptoms fully, and receive an instant, accurate medical guidance step based on Gemini responses.
- **Impact Detection (G-Load Tracking)**: Utilizing device accelerometers to measure real-time shock events, instantly launching safety verifications if thresholds (>4.0G) are breached.
- **Silent Safety Word (NEON)**: Say your pre-configured safety word ("neon") 3 times globally to trigger discreet SOS broadcasts with GPS coordinates.
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
