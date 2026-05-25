# RoadSOS: Intelligent Road Safety & Emergency Assistant

RoadSOS is a full-stack web application designed to enhance safety for drivers and commuters. It leverages real-time sensors, voice recognition, and AI to detect accidents and provide immediate assistance.

## 🚀 Key Features

- **Impact Detection (G-Load Monitoring)**: Uses device accelerometer data to detect high-impact events.
- **Safety Verification Flow**: Automatically probes the user for safety after a detected impact. If non-responsive or in danger, it initiates emergency protocols.
- **Voice-Activated SOS (Safety Word)**: Trigger emergency alerts silently by saying a custom safety word (e.g., "NEON") three times.
- **AI-Powered First Aid Guide**: Interactive voice assistant providing step-by-step first aid instructions based on the incident description.
- **Automated Emergency Notifications**: Sends GPS location via SMS and initiates automated phone calls to emergency contacts using Twilio.
- **Silent Distress Mode**: Specific triggers can send help requests without alerting nearby individuals.
- **Driving Mode (Twilio Integrated)**: An automated voice response for incoming calls while driving mode is active.

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Framer Motion, Lucide Icons.
- **Backend**: Node.js (Express), Twilio SDK (SMS & Voice), Google Gemini AI (First Aid Logic).
- **APIs**: Google Maps (Location display), Web Speech API (Recognition & Synthesis).

## 📋 Setup & Configuration

### Environment Variables
Create a `.env` file in the root directory and add the following:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_FROM_NUMBER=your_twilio_number

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key
```

### Installation
1. Install dependencies (Standard):
   ```bash
   npm install
   ```
   *Alternatively, if you prefer using the requirements.txt:*
   ```bash
   npm install $(cat requirements.txt | grep -v '^#')
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```

## 🚨 Emergency Protocols

### Safety Word Activation
- Saying the word **"NEON"** three times will trigger a silent distress broadcast.
- The system will NOT display any visual confirmation that help is on the way.
- A call and SMS will be sent to the pre-configured number (**+91 6361892311**) with the message "BOB's in danger" and current GPS coordinates.

### Impact Detection
- If G-load exceeds **4.0G**, the system will ask "Are you safe?" 3 times.
- If the user says "Yes, I am safe", the system resumes.
- If there is no response or "Help" is requested, the system asks "What is the problem?" and then broadcasts the SOS.

---
Built with ❤️ for road safety.
