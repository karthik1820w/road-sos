import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, MapPin, Search, ClipboardList, Phone, ArrowLeft, ShieldCheck, HeartPulse, Sparkles, Navigation } from 'lucide-react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { geoapifyService, Facility } from '../services/geoapifyService';

interface VoiceInterfaceProps {
  userLocation: { lat: number; lng: number } | null;
  onBack: () => void;
  onDispatchComplete: (data: any) => void;
  initialEmergencyState?: 'NORMAL' | 'HEARD_HELP' | 'FIRST_AID_ACTIVE' | 'DISPATCH_PENDING' | 'HELP_ARRIVING';
  onLogEvent?: (reason: string) => void;
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

export const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ userLocation, onBack, onDispatchComplete, initialEmergencyState = 'NORMAL', onLogEvent }) => {
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
  const helpResetTimeoutRef = useRef<any>(null);
  const neonCountRef = useRef<number>(0);
  const neonResetTimeoutRef = useRef<any>(null);
  const isSpeakingRef = useRef<boolean>(false);

  // Conversational state machine overrides
  const [emergencyState, setEmergencyState] = useState<'NORMAL' | 'HEARD_HELP' | 'FIRST_AID_ACTIVE' | 'DISPATCH_PENDING' | 'HELP_ARRIVING'>(initialEmergencyState);
  const [remedyText, setRemedyText] = useState<string>('');
  const [confirmedResponder, setConfirmedResponder] = useState<string>('');
  const [lastIncident, setLastIncident] = useState<string>('');

  useEffect(() => {
    if (initialEmergencyState === 'DISPATCH_PENDING') {
      speak("Initiating urgent distress protocol. Dispatching calls and SMS alerts to nearby hospitals and ambulance stations.");
      triggerEmergencyDispatch("Voice activated emergency distress alert (HELP spoken 3 times)");
    } else if (initialEmergencyState === 'HEARD_HELP') {
      speak("What is the issue?");
    }
  }, [initialEmergencyState]);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[VOICE DEBUG] Microphone Authorized / Active (Stream captured)");
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      console.error("[VOICE DEBUG] OS or Browser blocked microphone access:", err);
      return false;
    }
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        console.log("[VOICE DEBUG] Microphone Authorized / Active");
        transcriptBufferRef.current = '';
        setTranscript('');
      };

      recognitionRef.current.onresult = (event: any) => {
        if (isSpeakingRef.current) return;
        let chunkFinal = '';
        let chunkInterim = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            chunkFinal += event.results[i][0].transcript;
          } else {
            chunkInterim += event.results[i][0].transcript;
          }
        }
        
        if (chunkFinal || chunkInterim) {
          console.log("[VOICE DEBUG] Sound Detected (User is speaking...)");
        }

        const currentFullText = transcriptBufferRef.current + chunkFinal + chunkInterim;
        setTranscript(currentFullText);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        
        if (currentFullText.trim().length > 0) {
          silenceTimerRef.current = setTimeout(() => {
            console.log("[VOICE DEBUG] Silence Detected - Sending to Gemini");
            const textToSend = currentFullText.trim();
            console.log(`[VOICE DEBUG] Final Transcription: "${textToSend}"`);
            
            if (recognitionRef.current) {
              try { recognitionRef.current.stop(); } catch(e){}
            }
            if (textToSend && processVoiceRef.current) {
               processVoiceRef.current(textToSend);
            }
          }, 1500);
        }

        if (chunkFinal) {
          transcriptBufferRef.current += chunkFinal + ' ';
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          console.error("[VOICE DEBUG] Speech Error:", event.error);
        }
        if (event.error === 'not-allowed') {
          console.error("[VOICE DEBUG] Permission denied by OS/Browser.");
          setError("Microphone access denied. Please enable it in browser settings.");
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setError(`Voice Error: ${event.error}`);
        }
        setState('IDLE');
      };

      recognitionRef.current.onend = () => {
        if (state === 'RECORDING') {
          // Restart to maintain seamless flow
          // Can be omitted unless we want strict loop
        }
      };
    } else {
      setError("Speech recognition is not supported in this browser.");
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        try { recognitionRef.current.abort(); } catch(e) {}
      }
    };
  }, [state, emergencyState]);

  const startRecording = async () => {
    if (recognitionRef.current) {
      const granted = await checkMicrophonePermission();
      if (!granted) {
        setError("Microphone access denied. Please enable it in browser settings.");
        return;
      }
      setTranscript('');
      transcriptBufferRef.current = '';
      setError(null);
      setState('RECORDING');
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("[VOICE DEBUG] Failed to start recognition:", e);
      }
    }
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

  // Continuous status polling for incoming ambulance/hospital carrier acknowledgements
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (emergencyState === 'DISPATCH_PENDING') {
      intervalId = setInterval(async () => {
        try {
          const res = await fetch('/api/emergencies/confirmation-status');
          const data = await res.json();
          if (data.confirmed) {
            setEmergencyState('HELP_ARRIVING');
            setConfirmedResponder(data.responder || "Ambulance Unit");
            speak("HELP IS COMING!! HELP IS COMING!! Please stay calm and do not panic");
          }
        } catch (err) {
          console.error("Confirmation status fetch failed:", err);
        }
      }, 1500);
    }
    return () => clearInterval(intervalId);
  }, [emergencyState]);

  const triggerEmergencyDispatch = async (incident: string) => {
    setIsCalling(true);
    try {
      let relevantFacilities: any[] = [];
      if (userLocation) {
        const { lat, lng } = userLocation;
        try {
          const nearby = await geoapifyService.findNearbyEmergencyFacilities(lat, lng);
          relevantFacilities = nearby.slice(0, 3).map(f => ({
            name: f.name,
            type: f.type,
            location: { lat: f.lat, lng: f.lng },
            dispatch_number: f.dispatch_number || "+917892375787",
            address: f.address
          }));
        } catch (err) {
          console.error("Geoapify resolution issue:", err);
        }
      }

      if (relevantFacilities.length === 0) {
        relevantFacilities = [
          {
            name: "Regional Trauma Center",
            type: "HOSPITAL",
            location: userLocation || { lat: 0, lng: 0 },
            dispatch_number: "+917892375787",
            address: "1 Central Avenue"
          },
          {
            name: "Ambulance Hub Station #4",
            type: "AMBULANCE",
            location: userLocation ? { lat: userLocation.lat + 0.004, lng: userLocation.lng + 0.004 } : { lat: 0, lng: 0 },
            dispatch_number: "+917892375787",
            address: "Highway trauma bay"
          }
        ];
      }

      setResult({
        mode: 'EMERGENCY',
        content: `URGENT BROADCAST: BOB IN Danger!! BOB Needs help (Requested via voice assistant). Issue: ${incident}.`,
        facilities: relevantFacilities
      });

      // Clear any past confirmation status on server
      await fetch('/api/emergencies/confirmation-reset', { method: 'POST' });

      // Trigger dispatch alerts
      let locationDescription = "Location data is currently unavailable.";
      const locationString = userLocation ? `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}` : "Unknown Location";
      
      if (userLocation) {
        locationDescription = `at latitude ${userLocation.lat.toFixed(6)} and longitude ${userLocation.lng.toFixed(6)}`;
        try {
          const resolvedAddress = await geoapifyService.reverseGeocode(userLocation.lat, userLocation.lng);
          if (resolvedAddress && resolvedAddress !== "Unknown Location") {
            locationDescription = `${resolvedAddress}, at latitude ${userLocation.lat.toFixed(6)} and longitude ${userLocation.lng.toFixed(6)}`;
          }
        } catch (err) {
          console.error("Geocoding failed inside voice trigger:", err);
        }
      }

      const hospitalNames = relevantFacilities.map(f => f.name).join(", ");
      const medicalTxt = `DISTRESS ALERT: BOB IN Danger!! BOB Needs help.
Location: ${locationString}
Emergency details: ${incident}
Contact: ${hospitalNames}
If information is received and ambulance is sent press 1`;

      const recipients = ["+916361892311", "+917892375787"];

      // Send SMS Broadcast
      if ((window as any).roadsosExecuteWithOfflineFallback) {
         await (window as any).roadsosExecuteWithOfflineFallback('/api/emergencies/notify', 'POST', { recipients, message: medicalTxt });
      } else {
         await fetch('/api/emergencies/notify', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ recipients, message: medicalTxt })
         });
      }

      // Initiate Call with BOB Needs Help repeated 3 times and exact location
      const voiceCallMessage = `BOB IN Danger!! BOB Needs help. BOB IN Danger!! BOB Needs help. BOB IN Danger!! BOB Needs help. The user is located at: ${locationDescription}. Assistance is needed immediately.`;
      
      const numbersToCall = ["+916361892311", "+917892375787"];
      for (const ph of numbersToCall) {
        if ((window as any).roadsosExecuteWithOfflineFallback) {
          await (window as any).roadsosExecuteWithOfflineFallback('/api/calls/initiate', 'POST', {
            to: ph,
            message: voiceCallMessage
          });
        } else {
          await fetch('/api/calls/initiate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: ph,
              message: voiceCallMessage
            })
          });
        }
      }

    } catch (err) {
      console.error("Twilio Emergency Trigger issue:", err);
    } finally {
      setIsCalling(false);
    }
  };

  const handleCallPress = async () => {
    setIsCalling(true);
    setCountdown(null);
    
    try {
      const locationString = userLocation ? `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}` : "Unknown Location";
      const hospitalList = result?.facilities.map(f => f.name).join(", ") || "Nearest Trauma Center";
      
      const distressMessage = `DISTRESS ALERT: RoadSOS detected a high-G impact incident! 
Location: ${locationString}
Details: ${result?.content || "Severe accident detection"}
Alerted Responders: ${hospitalList}
SENDER_UID: RoadSOS_ALPHA_001
If information is received and ambulance is sent press 1`;

      const recipients = ["+916361892311", "+917892375787"];

      if ((window as any).roadsosExecuteWithOfflineFallback) {
         await (window as any).roadsosExecuteWithOfflineFallback('/api/emergencies/notify', 'POST', { recipients, message: distressMessage });
      } else {
         const res = await fetch('/api/emergencies/notify', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ recipients, message: distressMessage })
         });
         const data = await res.json();
         if (!data.success) throw new Error(data.error);
      }

      let locDesc = "Location data is currently unavailable.";
      if (userLocation) {
        locDesc = `at latitude ${userLocation.lat.toFixed(6)} and longitude ${userLocation.lng.toFixed(6)}`;
        try {
          const resolvedAddress = await geoapifyService.reverseGeocode(userLocation.lat, userLocation.lng);
          if (resolvedAddress && resolvedAddress !== "Unknown Location") {
            locDesc = `${resolvedAddress}, at latitude ${userLocation.lat.toFixed(6)} and longitude ${userLocation.lng.toFixed(6)}`;
          }
        } catch (err) {
          console.error("Geocoding failed inside call press:", err);
        }
      }
      const voiceCallMessage = `BOB IN Danger!! BOB Needs help. BOB IN Danger!! BOB Needs help. BOB IN Danger!! BOB Needs help. The user is located at: ${locDesc}. Assistance is needed immediately.`;

      const numbersToCall = ["+916361892311", "+917892375787"];
      for (const ph of numbersToCall) {
        if ((window as any).roadsosExecuteWithOfflineFallback) {
          await (window as any).roadsosExecuteWithOfflineFallback('/api/calls/initiate', 'POST', {
             to: ph,
             message: voiceCallMessage
          });
        } else {
          await fetch('/api/calls/initiate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              to: ph, 
              message: voiceCallMessage
            })
          });
        }
      }

      setTimeout(() => {
        if (result) onDispatchComplete({
          ...result,
          facility: result.facilities[0]
        });
      }, 3000);
    } catch (err: any) {
      console.error("Distress Broadcast Error:", err);
      setError("Broadcast failed. Manual dial recommended.");
      setIsCalling(false);
    }
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
      speak("Initiating urgent distress protocol. Dispatching calls and SMS alerts to nearby hospitals and ambulance stations.");
      setTranscript("Help! Help! Help!");
      setState('RESULT');
      helpCountRef.current = 0;
      if (helpResetTimeoutRef.current) clearTimeout(helpResetTimeoutRef.current);
      triggerEmergencyDispatch("Voice activated emergency distress alert (HELP spoken 3 times)");
      return;
    }

    // Detect "neon" spoken 3 times (either within this single utterance or cumulatively)
    const currentNeonMatches = (textLower.match(/\b(neon|neone|neoon|neo)\b/gi) || []).length;
    if (currentNeonMatches > 0) {
      if (onLogEvent) {
        onLogEvent(`Emergency word NEON is called (${currentNeonMatches} time${currentNeonMatches > 1 ? 's' : ''} detected in Voice Module)`);
      }
      neonCountRef.current += currentNeonMatches;
      console.log(`[Voice Component] Heard NEON keyword. Current cumulative matches: ${neonCountRef.current}/3`);
      if (neonResetTimeoutRef.current) clearTimeout(neonResetTimeoutRef.current);
      neonResetTimeoutRef.current = setTimeout(() => {
        neonCountRef.current = 0;
        console.log(`[Voice Component] Cumulative NEON count reset due to inactivity`);
      }, 15000);
    }

    if ((neonCountRef.current >= 3 || textLower.includes("neon neon neon") || textLower.includes("neon, neon, neon")) && emergencyState === 'NORMAL') {
      setEmergencyState('DISPATCH_PENDING');
      speak("Initiating secret safety word protocol. Dispatching calls and SMS alerts to configured emergency numbers.");
      setTranscript("NEON! NEON! NEON!");
      setState('RESULT');
      neonCountRef.current = 0;
      if (neonResetTimeoutRef.current) clearTimeout(neonResetTimeoutRef.current);
      triggerEmergencyDispatch("Safety Word (NEON x3) Activation");
      return;
    }

    // Challenge: Detect "faint"
    const isFaint = textLower.includes('faint');
    if (isFaint && emergencyState !== 'DISPATCH_PENDING') {
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
      
      await triggerEmergencyDispatch("User reported they are about to faint. Immediate assistance required.");
      return;
    }

    // Challenge 2: Detect "injured" / "injury"
    const isInjury = textLower.includes('injur') || textLower.includes('hurt') || textLower.includes('wound') || textLower.includes('bleed') || textLower.includes('pain') || textLower.includes('broken') || textLower.includes('scratch') || textLower.includes('headache') || textLower.includes('fracture') || textLower.includes('swell');
    if (isInjury && (emergencyState === 'HEARD_HELP' || emergencyState === 'NORMAL')) {
      setEmergencyState('FIRST_AID_ACTIVE');
      setLastIncident(text);
      setState('PROCESSING');

      try {
        const response = await fetch('/api/ai/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: `EMERGENCY FIRST AID REQUEST: The user has sustained an injury. Context transcript: "${text}". Provide immediate, step-by-step first-aid advice under 40 words. Use exact remedies.`
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
    }

    // Challenge 3: Detect "call ambulance"
    const isCallAmbulance = textLower.includes('call ambulance') || textLower.includes('ambulance') || textLower.includes('dispatch help') || textLower.includes('send ambulance');
    if (isCallAmbulance && emergencyState !== 'DISPATCH_PENDING' && emergencyState !== 'HELP_ARRIVING') {
      setEmergencyState('DISPATCH_PENDING');
      setState('RESULT');
      speak("Initiating urgent distress protocol. Dispatching calls and SMS alerts to nearby hospitals and ambulance stations.");
      
      await triggerEmergencyDispatch(lastIncident || "Severe injury distress");
      return;
    }

    // Fall back to original general voice RAG pipeline
    setState('PROCESSING');
    try {
      const response = await fetch('/api/ai/voice-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text })
      });
      const data = await response.json();
      
      let relevantFacilities: any[] = [];
      if (userLocation) {
        const { lat, lng } = userLocation;
        const nearby: Facility[] = await geoapifyService.findNearbyEmergencyFacilities(lat, lng);
        
        if (nearby.length > 0) {
          relevantFacilities = nearby.map(f => ({
            name: f.name,
            type: f.type,
            location: { lat: f.lat, lng: f.lng },
            dispatch_number: f.dispatch_number,
            address: f.address
          }));
        } else {
          relevantFacilities = [{
            name: "Regional Trauma Center",
            type: "HOSPITAL",
            location: { lat: lat + 0.01, lng: lng + 0.01 },
            dispatch_number: "+917892375787"
          }];
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
             onClick={() => recognitionRef.current?.stop()}
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
                    triggerEmergencyDispatch(lastIncident || "Severe Injury reported");
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
                <span className="text-xs font-black uppercase tracking-widest text-red-500 font-mono">Urgent Ambulance Dispatched</span>
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight mb-2 uppercase">TRANSMITTING COORDINATES</h3>
              <p className="text-xs text-slate-400 mb-6 font-mono uppercase tracking-widest leading-normal">
                Transmitting medical data & GPS maps coordinates to nearby hospitals & ambulance terminals.
              </p>
              
              <div className="space-y-2 mb-6">
                <div className="bg-slate-900 border border-red-500/20 p-4 rounded-2xl mb-4">
                  <p className="text-[10px] font-black tracking-widest text-red-500 uppercase mb-2">TARGET EMERGENCY RECIPIENTS:</p>
                  <div className="font-mono text-xs text-slate-200 divide-y divide-white/5">
                    <div className="py-1.5 flex justify-between">
                      <span>Hospital Hotline: <strong className="text-white">+91 6361892311</strong></span>
                      <span className="text-emerald-500 animate-pulse font-bold font-mono">✓ ALERT SENT</span>
                    </div>
                    <div className="py-1.5 flex justify-between">
                      <span>Ambulance Unit: <strong className="text-white">+91 7892375787</strong></span>
                      <span className="text-emerald-450 animate-pulse font-bold font-mono">✓ CALL QUEUED (Gather Active)</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/40 p-3 rounded-xl flex items-center justify-between border border-white/5">
                  <span className="text-xs text-slate-300 font-bold">SMS Broadcast status</span>
                  <span className="text-[10px] font-black text-emerald-500 font-mono">SENT TO BOTH</span>
                </div>
                <div className="bg-slate-900/40 p-3 rounded-xl flex items-center justify-between border border-white/5">
                  <span className="text-xs text-slate-300 font-bold">Voice Call Bridge status</span>
                  <span className="text-[10px] font-black text-emerald-500 font-mono">DIALING BOTH</span>
                </div>
                <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-2xl text-center">
                  <p className="text-xs text-red-400 uppercase font-black tracking-widest animate-pulse mb-1">
                    AWAITING CARRIER CONFIRMATION...
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Press 1 or reply "1" to confirm dispatch. Help status is updated live.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={async () => {
                    await fetch('/api/emergencies/confirm', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ responder: "Ambulance Driver #4 (Sanjivani Hospital)" })
                    });
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-xs uppercase tracking-widest"
                >
                  Simulate ambulance driver/hospital confirmation
                </button>
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
                <p className="text-sm font-bold text-white uppercase">{confirmedResponder || "Ambulance Driver #4"}</p>
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
