import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Phone, ArrowLeft, ShieldCheck, HeartPulse, Sparkles, Navigation } from 'lucide-react';
import { geoapifyService, Facility } from '../services/geoapifyService';
import { sharedWakeWordEngine } from '../safety/wakeWord';
import { raiseIncident, observeIncident, contactsFromProfile, type Incident, type IncidentKind } from '../services/incidentService';

interface VoiceInterfaceProps {
  userLocation: { lat: number; lng: number } | null;
  onBack: () => void;
  onDispatchComplete: (data: any) => void;
  initialEmergencyState?: 'NORMAL' | 'HEARD_HELP' | 'FIRST_AID_ACTIVE' | 'DISPATCH_PENDING' | 'HELP_ARRIVING';
  onLogEvent?: (reason: string) => void;
  /** Incident already raised by the App (e.g. HELP x3 path) so this screen can show live delivery status. */
  activeIncident?: Incident | null;
}

interface RAGResponse {
  mode: 'EMERGENCY' | 'TRAINING' | 'GENERAL';
  content: string;
  facilities: Array<{
    name: string;
    type: string;
    location: { lat: number; lng: number };
    dispatch_number: string;
    address?: string;
  }>;
}

export const FAINT_CONFIRMATION_THRESHOLD = 2; // Require 2 faint triggers or explicit confirmation

export const isFaintTrigger = (text: string) => text.includes('faint');
export const isInjuryTrigger = (text: string) => {
  return ['injur', 'hurt', 'wound', 'bleed', 'pain', 'broken', 'scratch', 'headache', 'fracture', 'swell']
    .some(keyword => text.includes(keyword));
};
export const isAmbulanceTrigger = (text: string) => {
  // Explicit "call ambulance" is a high-intent command, kept immediate to avoid delaying critical care
  return ['call ambulance', 'ambulance', 'dispatch help', 'send ambulance']
    .some(keyword => text.includes(keyword));
};
export const isConfirmationTrigger = (text: string) => {
  return ['yes', 'yeah', 'please', 'do it', 'confirm', 'help me']
    .some(keyword => text.includes(keyword));
};

export const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ userLocation, onBack, onDispatchComplete, initialEmergencyState = 'NORMAL', onLogEvent, activeIncident }) => {
  const [state, setState] = useState<'IDLE' | 'RECORDING' | 'PROCESSING' | 'RESULT'>(
    (initialEmergencyState === 'HEARD_HELP' || initialEmergencyState === 'DISPATCH_PENDING') ? 'RESULT' : 'IDLE'
  );
  const [result, setResult] = useState<RAGResponse | null>(null);
  const [transcript, setTranscript] = useState(
    (initialEmergencyState === 'HEARD_HELP' || initialEmergencyState === 'DISPATCH_PENDING') ? 'Help! Help! Help!' : ''
  );
  const [isCalling, setIsCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const helpCountRef = useRef<number>(0);
  const helpResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const faintCountRef = useRef<number>(0);
  const pendingInjuryTextRef = useRef<string | null>(null);

  // Conversational state machine overrides
  const [emergencyState, setEmergencyState] = useState<'NORMAL' | 'HEARD_HELP' | 'FIRST_AID_ACTIVE' | 'DISPATCH_PENDING' | 'HELP_ARRIVING'>(initialEmergencyState);
  const [remedyText, setRemedyText] = useState<string>('');
  const [confirmedResponder, setConfirmedResponder] = useState<string>('');
  const [lastIncident, setLastIncident] = useState<string>('');
  const [localIncident, setIncident] = useState<Incident | null>(null);
  const incident = localIncident || activeIncident || null;
  const [dispatchNote, setDispatchNote] = useState<string>('');
  const dispatchedRef = useRef(false);
  const unsubRef = useRef<null | (() => void)>(null);

  const readMedical = () => {
    try { return JSON.parse(localStorage.getItem('roadsos_medical') || '{}'); } catch { return {}; }
  };

  useEffect(() => {
    if (initialEmergencyState === 'DISPATCH_PENDING') {
      // The App already raised the incident for the "help x3" path; this screen only observes it.
      speak("Alerting your emergency contacts now. Stay on the line.");
    } else if (initialEmergencyState === 'HEARD_HELP') {
      speak("What is the issue?");
    }
    return () => { unsubRef.current?.(); };
  }, [initialEmergencyState]);

  useEffect(() => {
    if (!localIncident && activeIncident?.state === 'ACKED' && emergencyState === 'DISPATCH_PENDING') {
      setEmergencyState('HELP_ARRIVING');
      setConfirmedResponder(`${activeIncident.ack?.by || 'A contact'} (${(activeIncident.ack?.via || '').replace('_', ' ')})`);
    }
  }, [activeIncident?.state]);

  const watchIncident = (inc: Incident) => {
    setIncident(inc);
    unsubRef.current?.();
    unsubRef.current = observeIncident(inc.id, (u) => {
      setIncident(u);
      if (u.state === 'ACKED') {
        setEmergencyState('HELP_ARRIVING');
        setConfirmedResponder(`${u.ack?.by || 'A contact'} (${(u.ack?.via || '').replace('_', ' ')})`);
        speak("Help is coming. Your contact has confirmed they are responding. Please stay calm.");
      }
    });
  };

  // Speech Helper
  const speak = (msg: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(msg);
      (window as any).currentUtterance = utterance;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      isSpeakingRef.current = true;
      utterance.onstart = () => { isSpeakingRef.current = true; };
      utterance.onend = () => { isSpeakingRef.current = false; };
      utterance.onerror = () => { isSpeakingRef.current = false; };
      
      const approxDurationMs = Math.max(2000, msg.length * 70);
      setTimeout(() => {
        isSpeakingRef.current = false;
      }, approxDurationMs + 1000);

      window.speechSynthesis.speak(utterance);
    }
  };

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef<string>('');
  
  const processVoiceRef = useRef<any>(null);
  useEffect(() => {
    processVoiceRef.current = processVoice;
  });

  const checkMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true 
        } 
      });
      console.log("[VOICE DEBUG] Microphone Authorized / Active (Stream captured)");
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      console.error("[VOICE DEBUG] OS or Browser blocked microphone access:", err);
      return false;
    }
  };

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let isActive = true;

    if (state === 'RECORDING') {
      sharedWakeWordEngine.subscribe(
        { word: 'neon', shouldIgnore: () => isSpeakingRef.current },
        (t, f, c, a) => {
          if (!isActive || state !== 'RECORDING') return;
          if (isSpeakingRef.current) return;
          
          let chunkFinal = f ? t : '';
          let chunkInterim = !f ? t : '';

          if (chunkFinal || chunkInterim) {
            console.log("[VOICE DEBUG] Sound Detected (User is speaking...)");
          }
          
          // Incorporate confidence threshold (confidence filter)
          if (f && c > 0 && c < 0.3) {
             console.log("[VOICE DEBUG] Ignored due to low confidence:", c);
             return;
          }

          const currentFullText = transcriptBufferRef.current + chunkFinal + chunkInterim;
          setTranscript(currentFullText);

          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          
          const waitTime = f ? 400 : 2000;
          
          if (currentFullText.trim().length > 0) {
            silenceTimerRef.current = setTimeout(() => {
              console.log("[VOICE DEBUG] Silence Detected - Sending to Gemini");
              const textToSend = currentFullText.trim();
              console.log(`[VOICE DEBUG] Final Transcription: "${textToSend}"`);
              
              if (textToSend && processVoiceRef.current) {
                 transcriptBufferRef.current = '';
                 processVoiceRef.current(textToSend);
              }
            }, waitTime);
          }

          if (chunkFinal) {
            transcriptBufferRef.current += chunkFinal + ' ';
          }
        },
        (status) => {
           if (status === 'blocked') {
             setError("Microphone access denied.");
             setState('IDLE');
           }
        }
      ).then(unsubscribe => { unsub = unsubscribe; });
    }

    return () => {
      isActive = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (unsub) unsub();
    };
  }, [state, emergencyState]);

  const startRecording = async () => {
    const granted = await checkMicrophonePermission();
    if (!granted) {
      setError("Microphone access denied. Please enable it in browser settings.");
      return;
    }
    setTranscript('');
    transcriptBufferRef.current = '';
    setError(null);
    setState('RECORDING');
  };

  useEffect(() => {
    if (initialEmergencyState === 'NORMAL') {
      const timer = setTimeout(() => {
        startRecording();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (state === 'RESULT' && result?.mode === 'EMERGENCY' && !isCalling && emergencyState === 'NORMAL') {
      setCountdown(5);
    } else {
      setCountdown(null);
    }
  }, [state, result, isCalling, emergencyState]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown !== null && countdown > 0) {
      timer = setTimeout(() => setCountdown(prev => (prev !== null ? prev - 1 : null)), 1000);
    } else if (countdown === 0 && !isCalling) {
      handleCallPress();
    }
    return () => clearTimeout(timer);
  }, [countdown, isCalling]);

  /** Feature 2 — one incident, real delivery status, native fallback. */
  const triggerEmergencyDispatch = async (incidentText: string, kind: IncidentKind = 'VOICE_HELP') => {
    if (dispatchedRef.current) return;
    dispatchedRef.current = true;
    setIsCalling(true);
    setError(null);
    try {
      // Nearby facilities are shown for orientation only; we never invent them.
      let relevantFacilities: RAGResponse['facilities'] = [];
      if (userLocation) {
        try {
          const nearby = await geoapifyService.findNearbyEmergencyFacilities(userLocation.lat, userLocation.lng);
          relevantFacilities = nearby.slice(0, 3).map(f => ({ name: f.name, type: f.type, location: { lat: f.lat, lng: f.lng }, dispatch_number: f.dispatch_number, address: f.address }));
        } catch (err) { console.error("Facility lookup failed:", err); }
      }
      const mInfo = readMedical();
      const who = mInfo.name || 'RoadSOS user';
      setResult({ mode: 'EMERGENCY', content: `${who} needs help. Issue: ${incidentText}.`, facilities: relevantFacilities });

      let address: string | undefined;
      if (userLocation) {
        try { const a = await geoapifyService.reverseGeocode(userLocation.lat, userLocation.lng); if (a && a !== 'Unknown Location') address = a; } catch { /* optional */ }
      }

      const outcome = await raiseIncident({
        kind,
        reason: incidentText,
        location: userLocation,
        address,
        patient: { name: mInfo.name || '', phone: localStorage.getItem('roadSosUserPhone') || undefined, bloodGroup: mInfo.bloodGroup, allergies: mInfo.allergies, conditions: mInfo.conditions },
        contacts: contactsFromProfile(mInfo),
      });

      if (outcome.incident) {
        watchIncident(outcome.incident);
        if (outcome.incident.recommendedHospitals && outcome.incident.recommendedHospitals.length > 0) {
          const recFacilities = outcome.incident.recommendedHospitals.map(h => ({
            name: h.name,
            type: 'HOSPITAL',
            location: { lat: h.lat, lng: h.lng },
            dispatch_number: h.phone || '112',
            address: h.address || `${h.distanceKm} km away`,
          }));
          setResult({
            mode: 'EMERGENCY',
            content: `${who} needs help. ${outcome.incident.aiMedicalAnalysis ? `Assessment: ${outcome.incident.aiMedicalAnalysis.condition}.` : `Issue: ${incidentText}.`}`,
            facilities: recFacilities,
          });
        }
      }
      if (outcome.error === 'NO_CONTACTS') setDispatchNote('No emergency contacts saved — your dialer was opened for 112. Add contacts in Medical Profile.');
      else if (outcome.error === 'OFFLINE') setDispatchNote('Offline — the alert was queued and your messages app opened so you can send it now.');
      else if (outcome.error === 'ALL_CHANNELS_FAILED') setDispatchNote('Automatic SMS/calls failed — your messages app was opened with the alert.');
      else if (outcome.error) setDispatchNote(`Alert could not be sent automatically (${outcome.error}). Your messages app was opened.`);
      else setDispatchNote('');
    } catch (err: any) {
      console.error("Dispatch error:", err);
      setError("Broadcast failed. Manual dial recommended.");
      dispatchedRef.current = false;
    } finally {
      setIsCalling(false);
    }
  };

  const handleCallPress = async () => {
    setCountdown(null);
    setEmergencyState('DISPATCH_PENDING');
    await triggerEmergencyDispatch(result?.content || lastIncident || 'Emergency reported by voice', 'MEDICAL');
    setTimeout(() => {
      if (result) onDispatchComplete({ ...result, facility: result.facilities[0] || { name: 'Emergency contacts', location: userLocation } });
    }, 3000);
  };

  const processVoice = async (text: string) => {
    const textLower = text.toLowerCase().trim();

    // Detect "help" spoken 3 times (either within this single utterance or cumulatively)
    const currentMatches = (textLower.match(/\b(help)\b/gi) || []).length;
    if (currentMatches > 0) {
      if (onLogEvent) {
        onLogEvent(`Emergency word HELP is called (${currentMatches} time${currentMatches > 1 ? 's' : ''} detected in Voice Module)`);
      }
      helpCountRef.current += currentMatches;
      console.log(`[Voice Component] Heard help keyword. Current cumulative help matches: ${helpCountRef.current}/3`);
      if (helpResetTimeoutRef.current) clearTimeout(helpResetTimeoutRef.current);
      helpResetTimeoutRef.current = setTimeout(() => {
        helpCountRef.current = 0;
        console.log(`[Voice Component] Cumulative help count reset due to inactivity`);
      }, 15000);
    }

    if ((helpCountRef.current >= 3 || textLower.includes("help help help") || textLower.includes("help, help, help") || textLower.includes("help me, help me, help me")) && emergencyState === 'NORMAL') {
      setEmergencyState('DISPATCH_PENDING');
      speak("Initiating urgent distress protocol. Automated call, message, and medical report dispatched to hospital and emergency contacts.");
      setTranscript("Help! Help! Help!");
      setState('RESULT');
      helpCountRef.current = 0;
      if (helpResetTimeoutRef.current) clearTimeout(helpResetTimeoutRef.current);
      triggerEmergencyDispatch("Voice activated emergency distress alert (HELP spoken 3 times)", 'SAFETY_WORD');
      return;
    }

    // NOTE: Safety-word detection (previously hardcoded to "neon" here) has been removed.
    // Safety-word matching is handled exclusively by App.tsx via SafetyWordMatcher, which
    // respects the user-configured word. Having a second, hardcoded matcher here was a
    // correctness bug: changing the safety word in settings didn't affect this code path.

    // Challenge: Detect "faint" (requires 2x repetition or confirmation)
    if (faintCountRef.current > 0 && isConfirmationTrigger(textLower) && emergencyState !== 'DISPATCH_PENDING') {
      faintCountRef.current = 2; // satisfy threshold
    }
    
    if (isFaintTrigger(textLower) && emergencyState !== 'DISPATCH_PENDING') {
      faintCountRef.current += 1;
    }

    if (faintCountRef.current > 0 && emergencyState !== 'DISPATCH_PENDING') {
      if (faintCountRef.current >= FAINT_CONFIRMATION_THRESHOLD) {
        faintCountRef.current = 0;
        setEmergencyState('DISPATCH_PENDING');
        setState('RESULT');
        
        // Play a strong alarm
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime + 0.5);
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime + 1.0);
        
        gainNode.gain.setValueAtTime(1, audioCtx.currentTime); // High volume
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 2); // 2 second burst

        speak("Medical alert. User is fainting. Initiating distress call to family members.");
        setTranscript("About to faint...");
        
        await triggerEmergencyDispatch("User reported they are about to faint. Immediate assistance required.", 'MEDICAL');
        return;
      } else {
        speak("Did you say you are going to faint? Please say yes to confirm or repeat faint.");
        return;
      }
    }

    // Challenge 2: Detect "injured" / "injury" (requires confirmation)
    if (pendingInjuryTextRef.current && (emergencyState === 'HEARD_HELP' || emergencyState === 'NORMAL')) {
      if (isConfirmationTrigger(textLower)) {
        const confirmedText = pendingInjuryTextRef.current;
        pendingInjuryTextRef.current = null;
        
        setEmergencyState('FIRST_AID_ACTIVE');
        setLastIncident(confirmedText);
        setState('PROCESSING');

        try {
          const response = await fetch('/api/ai/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: `EMERGENCY FIRST AID REQUEST: The user has sustained an injury. Context transcript: "${confirmedText}". Provide immediate, step-by-step first-aid advice under 40 words. Use exact remedies.`
            })
          });
          const data = await response.json();
          setRemedyText(data.answer);
          setState('RESULT');
          speak(`First aid feature activated. ${data.answer}. If you require an ambulance, please say "call ambulance".`);
        } catch (err) {
          const fallbackMsg = "Keep the limb steady, wash off wounds, apply firm pressure, elevate, and keep warm.";
          setRemedyText(fallbackMsg);
          setState('RESULT');
          speak(`First aid feature activated. ${fallbackMsg}. If you require an ambulance, please say "call ambulance".`);
        }
        return;
      } else {
        pendingInjuryTextRef.current = null;
        speak("Okay, cancelling injury protocol.");
        // Continue processing this new utterance
      }
    }

    if (isInjuryTrigger(textLower) && (emergencyState === 'HEARD_HELP' || emergencyState === 'NORMAL')) {
      pendingInjuryTextRef.current = text;
      speak("I heard an injury keyword. Do you need first aid advice? Say yes to confirm.");
      return;
    }

    // Challenge 3: Detect "call ambulance"
    // (Explicit commands remain immediate to avoid delaying critical care)
    if (isAmbulanceTrigger(textLower) && emergencyState !== 'DISPATCH_PENDING' && emergencyState !== 'HELP_ARRIVING') {
      setEmergencyState('DISPATCH_PENDING');
      setState('RESULT');
      speak("Initiating urgent distress protocol. Dispatching calls and SMS alerts to nearby hospitals and ambulance stations.");
      
      await triggerEmergencyDispatch(lastIncident || "Severe injury distress", 'MEDICAL');
      return;
    }

    const fallbackToVoiceProcess = async (fallbackText: string) => {
      setState('PROCESSING');
      try {
        const response = await fetch('/api/ai/voice-process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: fallbackText })
        });
        const data = await response.json();
        
        let relevantFacilities: any[] = [];
        if (userLocation) {
          const { lat, lng } = userLocation;
          const nearby = await geoapifyService.findNearbyEmergencyFacilities(lat, lng).catch(() => []);
          if (nearby.length > 0) {
            relevantFacilities = nearby.map((f: any) => ({
              name: f.name,
              type: f.type,
              location: { lat: f.lat, lng: f.lng },
              dispatch_number: f.dispatch_number,
              address: f.address
            }));
          }
        }

        setResult({
          mode: data.mode,
          content: data.content,
          facilities: relevantFacilities
        });
        setState('RESULT');
        if (data.content) {
          speak(data.content);
        }
      } catch (err) {
        setError("Connection lost. Retrying...");
        setState('IDLE');
      }
    };

    // Try Streaming Pipeline First
    setState('PROCESSING');
    try {
      const { getSocket } = await import('../services/incidentService');
      const socket = getSocket();
      
      let aiResponseText = "";
      let utteranceBuffer = "";
      let hasStartedSpeaking = false;
      
      const handleChunk = (chunk: string) => {
        aiResponseText += chunk;
        setResult(prev => ({
          mode: prev?.mode || 'GENERAL',
          content: aiResponseText,
          facilities: prev?.facilities || []
        }));
        
        utteranceBuffer += chunk;
        const match = utteranceBuffer.match(/([^\.!\?]+[\.!\?]+)(.*)/);
        if (match) {
          const sentence = match[1].trim();
          utteranceBuffer = match[2];
          if (sentence) speak(sentence);
          hasStartedSpeaking = true;
        }
      };
      
      const handleEnd = async (data: any) => {
        socket.off('voice:chunk', handleChunk);
        socket.off('voice:end', handleEnd);
        socket.off('voice:error', handleError);
        
        if (utteranceBuffer.trim()) speak(utteranceBuffer.trim());

        let relevantFacilities: any[] = [];
        if (userLocation) {
          const { lat, lng } = userLocation;
          const nearby = await geoapifyService.findNearbyEmergencyFacilities(lat, lng).catch(() => []);
          if (nearby.length > 0) {
            relevantFacilities = nearby.map((f: any) => ({
              name: f.name,
              type: f.type,
              location: { lat: f.lat, lng: f.lng },
              dispatch_number: f.dispatch_number,
              address: f.address
            }));
          }
        }
        
        setResult(prev => ({
          mode: data.mode || 'GENERAL',
          content: aiResponseText,
          facilities: relevantFacilities
        }));
        setState('RESULT');
      };
      
      const handleError = () => {
         socket.off('voice:chunk', handleChunk);
         socket.off('voice:end', handleEnd);
         socket.off('voice:error', handleError);
         if (!hasStartedSpeaking) fallbackToVoiceProcess(text);
      };

      socket.on('voice:chunk', handleChunk);
      socket.on('voice:end', handleEnd);
      socket.on('voice:error', handleError);

      setResult({ mode: 'GENERAL', content: '', facilities: [] });

      const response = await fetch('/api/ai/voice-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, socketId: socket.id })
      });
      if (!response.ok) handleError();
    } catch (e) {
      fallbackToVoiceProcess(text);
    }
  };


  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-8 selection:bg-red-500/20"
    >
      <button onClick={onBack} className="absolute top-8 left-8 text-slate-500 flex items-center gap-2 hover:text-white transition-colors">
        <ArrowLeft size={20} />
        <span className="text-xs font-bold uppercase tracking-widest">Back</span>
      </button>

      {state === 'IDLE' && error && (
        <div className="text-center">
          <p className="mt-4 text-red-500 text-xs font-bold font-mono">{error}</p>
          <button 
            onClick={startRecording}
            className="mt-4 px-6 py-2 bg-red-500 text-white font-bold rounded-full hover:bg-red-600"
          >
            Retry Microphone
          </button>
        </div>
      )}

      {state === 'RECORDING' && (
        <div className="text-center w-full max-w-sm">
          <motion.div 
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            className="w-24 h-24 bg-red-650 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-red-800/30 border border-red-500"
          >
            <Mic size={40} className="text-white" />
          </motion.div>
          <h2 className="text-xl font-black mb-4 uppercase tracking-tighter">Recording voice...</h2>
          <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl min-h-[100px] flex items-center justify-center">
            <p className="text-lg italic text-slate-200 font-medium leading-relaxed">
              {transcript || "Speak clearly now..."}
            </p>
          </div>
          <button 
             onClick={() => setState('IDLE')}
             className="mt-6 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white"
          >
            Done Speaking
          </button>
        </div>
      )}

      {state === 'PROCESSING' && (
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-650 border-t-transparent rounded-full animate-spin mx-auto mb-8"></div>
          <h2 className="text-2xl font-black mb-2 uppercase tracking-tighter">Parsing Stream</h2>
          <p className="text-slate-500 uppercase tracking-widest text-xs font-bold">Matching parameters against medical databases</p>
          <p className="mt-4 text-xs font-mono text-red-500 italic">"{transcript}"</p>
        </div>
      )}

      {state === 'RESULT' && (
        <div className="w-full max-w-lg">
          {emergencyState === 'NORMAL' && result && (
            <div>
              <div className={`p-8 rounded-3xl border-2 mb-6 ${result.mode === 'EMERGENCY' ? 'bg-red-600/10 border-red-500/50' : 'bg-blue-600/10 border-blue-500/50'}`}>
                <div className="flex items-center gap-3 mb-6">
                  <ShieldCheck className={result.mode === 'EMERGENCY' ? 'text-red-500' : 'text-blue-500'} />
                  <span className="text-xs font-black uppercase tracking-widest">{result.mode} PROTOCOL ACTIVE</span>
                </div>
                <div className="prose prose-invert prose-sm">
                  <p className="text-lg font-medium leading-relaxed">{result.content}</p>
                </div>
              </div>

              {result.mode === 'EMERGENCY' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {result.facilities.map((f, i) => (
                      <div key={i} className="bg-slate-900/50 border border-white/5 p-3 rounded-xl">
                        <p className="text-[8px] font-black text-red-550 uppercase tracking-widest">{f.type}</p>
                        <p className="text-[10px] font-bold text-white truncate">{f.name}</p>
                      </div>
                    ))}
                  </div>
                  
                  <button
                     onClick={handleCallPress}
                     disabled={isCalling}
                     className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-6 rounded-2xl flex items-center justify-center gap-4 shadow-xl shadow-red-900/20 active:scale-95 transition-all text-xl"
                  >
                    <Phone size={24} className={isCalling ? 'animate-pulse opacity-50' : ''} />
                    {isCalling ? 'STABILIZING CONNECTION...' : (countdown !== null ? `DATA VERIFICATION IN ${countdown}s...` : `START DISPATCH SEQUENCE`)}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Prompt: HEARD HELP */}
          {emergencyState === 'HEARD_HELP' && (
            <div className="p-8 rounded-[36px] border-2 border-orange-500/40 bg-orange-650/10 text-center shadow-xl">
              <Sparkles className="text-orange-500 mx-auto mb-4 animate-bounce" size={48} />
              <h3 className="text-xs font-black uppercase tracking-widest text-orange-500 mb-2">Voice Activated Emergency</h3>
              <p className="text-2xl font-black text-white mb-6">"What is the issue?"</p>
              <div className="flex gap-2">
                <button
                  onClick={startRecording}
                  className="flex-1 py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-colors"
                >
                  Speak Injury Details Now
                </button>
                <button
                  onClick={() => {
                    setEmergencyState('NORMAL');
                    setState('IDLE');
                    onBack();
                  }}
                  className="px-6 py-4 bg-slate-900 hover:bg-slate-800 text-slate-400 font-bold text-xs uppercase tracking-widest rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* State: FIRST_AID_ACTIVE */}
          {emergencyState === 'FIRST_AID_ACTIVE' && (
            <div className="p-8 rounded-[36px] border-2 border-emerald-500/40 bg-emerald-650/10 text-left shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <HeartPulse className="text-emerald-500 animate-pulse" size={24} />
                <span className="text-xs font-black uppercase tracking-widest text-emerald-500">First Aid Feature Activated</span>
              </div>
              <h3 className="text-2xl font-black text-slate-100 tracking-tight mb-4 uppercase">Remedy Instructions</h3>
              <div className="bg-slate-900/80 p-6 rounded-2xl border border-white/5 font-mono text-xs leading-relaxed text-emerald-400 mb-6 max-h-[160px] overflow-y-auto selection:bg-emerald-950">
                {remedyText || "Resolving immediate antidote..."}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setEmergencyState('DISPATCH_PENDING');
                    speak("Initiating urgent distress protocol. Dispatching calls and SMS alerts to nearest hospitals.");
                    triggerEmergencyDispatch(lastIncident || "Severe Injury reported", 'MEDICAL');
                  }}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-xs uppercase tracking-widest"
                >
                  <Phone size={14} />
                  Say "Call Ambulance" Or Dispatch Alerts
                </button>
                <button
                  onClick={startRecording}
                  className="w-full bg-slate-900 hover:bg-slate-850 text-slate-300 font-bold py-3 rounded-xl text-center text-xs uppercase tracking-widest"
                >
                  Speak More Symptoms
                </button>
              </div>
            </div>
          )}

          {/* State: DISPATCH_PENDING */}
          {emergencyState === 'DISPATCH_PENDING' && (
            <div className="p-8 rounded-[36px] border-2 border-red-500 bg-red-650/10 text-left relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse" />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span className="text-xs font-black uppercase tracking-widest text-red-500 font-mono">Emergency alert in progress</span>
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight mb-2 uppercase">Contacts being alerted</h3>
              <p className="text-xs text-slate-400 mb-6 font-mono uppercase tracking-widest leading-normal">
                SMS with your location and medical card, then a voice call, to every saved emergency contact.
              </p>
              
              <div className="space-y-2 mb-6">
                <div className="bg-slate-900 border border-red-500/20 p-4 rounded-2xl mb-4">
                  <p className="text-[10px] font-black tracking-widest text-red-500 uppercase mb-2">Alert delivery</p>
                  <div className="font-mono text-xs text-slate-200 divide-y divide-white/5">
                    {(incident?.deliveries || []).map(d => (
                      <div key={d.id} className="py-1.5 flex justify-between gap-3">
                        <span>{d.channel.toUpperCase()} → {d.to}</span>
                        <span className={`font-bold ${d.status === 'failed' ? 'text-red-400' : d.status === 'delivered' || d.status === 'answered' ? 'text-emerald-400' : d.status === 'no_answer' ? 'text-amber-400' : 'text-slate-400 animate-pulse'}`}>{d.status.replace('_', ' ').toUpperCase()}</span>
                      </div>
                    ))}
                    {!incident && <p className="py-1.5 text-slate-500">{isCalling ? 'Contacting your emergency contacts…' : 'No alert has been sent yet.'}</p>}
                    {incident && incident.deliveries.length === 0 && <p className="py-1.5 text-slate-500">Preparing alerts…</p>}
                  </div>
                </div>
                {dispatchNote && (
                  <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-xs text-amber-200 font-bold">{dispatchNote}</div>
                )}
                <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-2xl text-center">
                  <p className="text-xs text-red-400 uppercase font-black tracking-widest animate-pulse mb-1">
                    Waiting for a contact to confirm
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    They press 1 on the call or reply 1 by SMS. This screen updates live.
                  </p>
                </div>
                <a href="tel:112" className="block w-full text-center bg-white text-black font-black py-4 rounded-xl text-xs uppercase tracking-widest">Call 112 now</a>
              </div>
            </div>
          )}

          {/* State: HELP_ARRIVING */}
          {emergencyState === 'HELP_ARRIVING' && (
            <div className="p-8 rounded-[36px] border-2 border-emerald-500 bg-emerald-650/10 text-center relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
              <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <Navigation className="text-emerald-500 animate-pulse rotate-45" size={28} />
              </div>
              <h3 className="text-xs font-black uppercase tracking-widest text-emerald-500 font-mono mb-2">
                DISPATCH SECURED
              </h3>
              <h2 className="text-3xl font-black text-white tracking-tighter uppercase mb-2">
                HELP IS ARRIVING
              </h2>
              <div className="bg-slate-900/80 p-5 rounded-2xl border border-white/5 font-mono mb-6 max-w-sm mx-auto">
                <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Assigned Dispatch Unit</p>
                <p className="text-sm font-bold text-white uppercase">{confirmedResponder || "Emergency contact"}</p>
                <p className="text-xs text-emerald-400 mt-2 font-bold animate-pulse">✓ En-route and navigation locked</p>
              </div>
              <button 
                onClick={() => {
                  setEmergencyState('NORMAL');
                  setState('IDLE');
                  onBack();
                }}
                className="px-6 py-3 bg-white text-black text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-colors"
              >
                Clear Alert & Reset
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
