import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';

export const PrivacyPolicy: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 mb-8 mt-8 text-slate-300">
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={onBack}
          className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div className="p-3 bg-blue-900/30 rounded-xl">
          <Shield className="text-blue-400" size={24} />
        </div>
        <h2 className="text-2xl font-black text-white">Privacy Policy</h2>
      </div>

      <div className="space-y-8 text-sm leading-relaxed">
        <div>
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <p className="mt-4">
            RoadSOS ("we", "our", or "us") is an emergency safety and travel assistant app. Because our core function is to detect road incidents and trigger rescue operations, we request access to several sensitive device permissions. This Privacy Policy outlines exactly how and why we use your data.
          </p>
        </div>

        <div>
          <h3 className="text-lg font-bold text-white mb-2 border-b border-slate-800 pb-2">1. Location Data (Foreground and Background)</h3>
          <p><strong>What we collect:</strong> We request access to your precise device location both while the app is in use (Foreground) and while it is minimized or running as a service (Background).</p>
          <p className="mt-2"><strong>Why we need it:</strong></p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li><strong>Emergency Dispatch:</strong> If a crash is detected or an SOS is triggered, your precise location is sent to your emergency contacts via SMS and Webhooks to direct help to your exact coordinates.</li>
            <li><strong>Crash Detection:</strong> We analyze your GPS speed alongside accelerometer data in the background to accurately detect sudden stops associated with vehicle collisions.</li>
            <li><strong>Traffic & Navigation:</strong> To provide live route updates, nearest trauma centers, and audio navigation.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-lg font-bold text-white mb-2 border-b border-slate-800 pb-2">2. Microphone and Audio (RECORD_AUDIO)</h3>
          <p><strong>What we collect:</strong> We request access to record audio.</p>
          <p className="mt-2"><strong>Why we need it:</strong></p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li><strong>Hands-Free SOS (Safety Word):</strong> The app listens in the background for your configured "safety word" to trigger a silent SOS without requiring you to touch the screen.</li>
            <li><strong>Conversational AI:</strong> You can interact with the app hands-free (e.g., asking for First Aid advice, navigating) by speaking to the AI assistant.</li>
          </ul>
          <p className="mt-2"><em>Note: Audio is processed on-device for wake-word detection or sent securely to Google's Gemini API during active AI interactions. We do not store or sell your voice recordings.</em></p>
        </div>

        <div>
          <h3 className="text-lg font-bold text-white mb-2 border-b border-slate-800 pb-2">3. SMS and Phone Calls (SEND_SMS, CALL_PHONE)</h3>
          <p><strong>What we collect:</strong> We request permission to send SMS messages and initiate phone calls directly from your device.</p>
          <p className="mt-2"><strong>Why we need it:</strong></p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li><strong>Offline Emergency Fallback:</strong> If our primary cloud-based Twilio dispatch system fails or if you have no internet connection, the app will use your native cellular network to send an SMS and dial 112 (or your emergency contact) directly from your phone.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-lg font-bold text-white mb-2 border-b border-slate-800 pb-2">4. Contacts (READ_CONTACTS)</h3>
          <p><strong>What we collect:</strong> We request access to read your device contacts.</p>
          <p className="mt-2"><strong>Why we need it:</strong></p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li><strong>Selecting Emergency Contacts:</strong> We allow you to pick family members or friends directly from your phone book to set as your emergency contacts.</li>
            <li><strong>Driving Mode Auto-Reply:</strong> When Driving Mode is enabled, the app checks incoming calls against your contacts list to determine who should receive the automated "I am driving" reply.</li>
          </ul>
          <p className="mt-2"><em>Note: We do not upload your entire address book to our servers. Contact data is only used locally for the purposes mentioned above.</em></p>
        </div>

        <div>
          <h3 className="text-lg font-bold text-white mb-2 border-b border-slate-800 pb-2">5. Data Sharing and Retention</h3>
          <p>We do not sell your personal data. Emergency incident data (including location and medical profile) is temporarily sent to our backend to generate signed Medical Handover Reports and dispatch Twilio webhooks, after which it is handled according to our secure retention policies.</p>
        </div>

        <div>
          <h3 className="text-lg font-bold text-white mb-2 border-b border-slate-800 pb-2">6. Contact Us</h3>
          <p>If you have any questions regarding this Privacy Policy or our data practices, please contact us at privacy@roadsos.app.</p>
        </div>
      </div>
    </section>
  );
};
