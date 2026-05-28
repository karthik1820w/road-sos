import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, PhoneCall, Activity, Zap, Navigation, Gauge, BarChart3, Heart, ClipboardList, FileText, ChevronRight, Info, AlertCircle, Mic, X, Bot } from 'lucide-react';
import { EmergencyUI } from './components/EmergencyUI';
import { VoiceInterface } from './components/VoiceInterface';
import { DispatchSummary } from './components/DispatchSummary';
import { HazardMonitor } from './components/HazardMonitor';
import { GoogleMapComponent } from './components/GoogleMapComponent';
import { InstallAppBanner } from './components/InstallAppBanner';
import { ChatbotModal } from './components/ChatbotModal';
import { APIProvider } from '@vis.gl/react-google-maps';
import { ResponsiveContainer, LineChart, Line, YAxis, CartesianGrid } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

import { SOSTrigger } from './components/SOSTrigger';
import { geoapifyService } from './services/geoapifyService';
import { BatteryIndicator } from './components/BatteryIndicator';
import { PermissionsModal } from './components/PermissionsModal';
import { EmergencySOSModal } from './components/EmergencySOSModal';

import { io } from 'socket.io-client';

const socket = io(); // connect to the same host

export default function App() {
  const [setupComplete, setSetupComplete] = useState(false);
  const [userPhone, setUserPhone] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isSosModalOpen, setIsSosModalOpen] = useState(false);
  const [isChatbotModalOpen, setIsChatbotModalOpen] = useState(false);

  const [dispatchData, setDispatchData] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({ lat: 12.971598, lng: 77.594566 });
  const [telemetry, setTelemetry] = useState({ x: 0, y: 0, z: 9.8 });
  const [peakG, setPeakG] = useState(1.0);
  const [history, setHistory] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>(() => {
    const saved = localStorage.getItem('roadsos_logs');
    if (saved) {
      try {
        const parsedLogs = JSON.parse(saved);
        return parsedLogs.map((log: any, index: number) => ({
          ...log,
          id: index.toString() + '_' + Date.now() + '_' + Math.random().toString()
        }));
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const logsRef = useRef(logs);
  useEffect(() => { logsRef.current = logs; }, [logs]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [motionPermission, setMotionPermission] = useState<'granted' | 'denied' | 'prompt' | 'unsupported'>('prompt');
  
  // New States
  const [safetyWord] = useState('NEON');
  const [isDrivingMode, setIsDrivingMode] = useState(false);
  const toggleDrivingMode = async () => {
    const newState = !isDrivingMode;
    setIsDrivingMode(newState);
    try {
      await fetch('/api/status/driving', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newState })
      });
    } catch (e) {
      console.error("Failed to sync driving status:", e);
    }
  };

  useEffect(() => {
    // Initial sync
    fetch('/api/status/driving', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: isDrivingMode })
    }).catch(e => console.error("Initial driving sync error:", e));
  }, []);

  const [showDrivingSimulator, setShowDrivingSimulator] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [isDistressPending, setIsDistressPending] = useState(false);
  const isDistressPendingRef = useRef(false);
  const [countdownSeconds, setCountdownSeconds] = useState(5);

  const [showMedicalProfile, setShowMedicalProfile] = useState(false);
  const [medicalInfo, setMedicalInfo] = useState(() => {
    const saved = localStorage.getItem('roadsos_medical');
    return saved ? JSON.parse(saved) : {
      name: 'User',
      bloodGroup: 'B+',
      allergies: 'None',
      emergencyContact: '+91 7892375787'
    };
  });
  const medicalInfoRef = useRef(medicalInfo);
  useEffect(() => { medicalInfoRef.current = medicalInfo; }, [medicalInfo]);

  const [showTraumaGuide, setShowTraumaGuide] = useState(false);


  const [aiFirstAidResponse, setAiFirstAidResponse] = useState<string>("Listening for incident description...");
  const firstAidMentionCountRef = useRef(0);
  const [isAIFirstAidActive, setIsAIFirstAidActive] = useState(false);
  const isAIFirstAidActiveRef = useRef(false);
  const aiFirstAidTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isBroadcastingRef = useRef(false);

  // Safety Verification Flow States
  const [isSafetyChecking, setIsSafetyChecking] = useState(false);
  const [safetyCheckRound, setSafetyCheckRound] = useState(0);
  const [isWaitingForIncident, setIsWaitingForIncident] = useState(false);
  const safetyCheckTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSafetyCheckingRef = useRef(false);
  const isWaitingForIncidentRef = useRef(false);
  const isWaitingForEmergencyChoiceRef = useRef(false);

  const [voiceMapQuery, setVoiceMapQuery] = useState<string>('');
  const isWaitingForMapSearchRef = useRef(false);

  const backgroundRecognitionRef = useRef<any>(null);
  const pendingDistressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDistressReasonRef = useRef<string>("");
  const firstAidResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cancelDistress = () => {
    if (pendingDistressTimerRef.current) {
      clearInterval(pendingDistressTimerRef.current);
      pendingDistressTimerRef.current = null;
    }
    setIsDistressPending(false);
    isDistressPendingRef.current = false;
    setCountdownSeconds(5);
    speakNotification("Alert cancelled. System reset to safe mode.");
    console.log("[Safety] Distress alert cancelled by user.");
  };

  useEffect(() => {
    localStorage.setItem('roadsos_medical', JSON.stringify(medicalInfo));
  }, [medicalInfo]);

  useEffect(() => {
    localStorage.setItem('roadsos_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    const handleWakeChatbot = () => setIsChatbotModalOpen(true);
    window.addEventListener('wake-chatbot', handleWakeChatbot);
    return () => window.removeEventListener('wake-chatbot', handleWakeChatbot);
  }, []);



  useEffect(() => {
    socket.on("help_arriving", async (data) => {
      console.log("[Socket] Help arriving notification:", data);
      speakNotification("HELP IS COMING!! HELP IS COMING!! Please stay calm and do not panic");
      setIsConfirmedHelpArriving(true);

      // Check if this was likely triggered by the 3x voice command check.
      // We look at our logs to see if the trigger "HELP spoken 3 times" was logged recently.
      const requestedByVoice = logsRef.current.some(l => 
        l.message.includes("HELP spoken 3 times") && (Date.now() - l.timestamp < 3600000)
      );

      if (requestedByVoice && data.responder) {
        console.log("[App] Sending auto PDF report to responder:", data.responder);
        try {
          await fetch('/api/sos/send-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              responder: data.responder,
              logs: logsRef.current.slice(0, 50),
              medicalInfo: medicalInfoRef.current
            })
          });
        } catch (e) {
          console.error("Failed to send report:", e);
        }
      }
    });

    socket.on("neon_confirmed", (data) => {
      console.log("[Socket] Neon confirmed notification:", data);
      if (navigator.vibrate) {
        // Vibrate to denote person has received safe word signal
        navigator.vibrate([500, 200, 500, 200, 1000]);
      }
      setIsConfirmedNeon(true);
    });

    return () => {
      socket.off("help_arriving");
      socket.off("neon_confirmed");
    };
  }, []);

  const [isConfirmedHelpArriving, setIsConfirmedHelpArriving] = useState(false);
  const [isConfirmedNeon, setIsConfirmedNeon] = useState(false);
  const isConfirmedHelpArrivingRef = useRef(false);

  // Traffic Updates
  const [trafficUpdate, setTrafficUpdate] = useState<string | null>(null);
  const [fetchingTraffic, setFetchingTraffic] = useState(false);
  const [showTrafficMap, setShowTrafficMap] = useState(false);

  const fetchTrafficUpdates = async (locationName?: string) => {
    if (!userLocation && !locationName) return;
    setFetchingTraffic(true);
    setTrafficUpdate(null);
    setShowTrafficMap(true);
    try {
      const res = await fetch('/api/traffic-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userLocation, locationName })
      });
      const data = await res.json();
      let updateText = "No traffic updates found currently.";
      if (data.update) {
        const locationContext = locationName 
          ? `Traffic updates for ${locationName}: ` 
          : "Traffic updates near your current location: ";
        updateText = locationContext + data.update;
      }
      setTrafficUpdate(updateText);
      
      // Speak the traffic update
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(updateText);
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      const errorText = "Failed to fetch traffic updates.";
      setTrafficUpdate(errorText);
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(errorText);
        window.speechSynthesis.speak(utterance);
      }
    } finally {
      setFetchingTraffic(false);
    }
  };

  useEffect(() => {
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch('/api/emergencies/confirmation-status');
        const data = await res.json();
        if (data.confirmed) {
          if (!isConfirmedHelpArrivingRef.current) {
            isConfirmedHelpArrivingRef.current = true;
          }
        } else {
          isConfirmedHelpArrivingRef.current = false;
        }
      } catch (err) {
        // ignore
      }
    }, 2000);
    return () => clearInterval(intervalId);
  }, []);

  const saveLogEntry = (reason: string, location: any) => {
    const newEntry = {
      id: crypto.randomUUID() || Date.now().toString() + Math.random().toString(),
      timestamp: new Date().toISOString(),
      reason,
      location,
      peakG: peakG
    };
    setLogs(prev => [newEntry, ...prev]);
  };

  const executeNeonDistress = async () => {
    if (isBroadcastingRef.current) return;
    isBroadcastingRef.current = true;
    const reason = "Secret Distress word NEON triggered";
    saveLogEntry(reason, userLocation);
    const targetNumbers = ["+916361892311"]; // NEON specific target

    let addressStr = "Unknown Location";
    if (userLocation) {
      try {
        const addr = await geoapifyService.reverseGeocode(userLocation.lat, userLocation.lng);
        addressStr = addr;
      } catch (e) {
        addressStr = `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
      }
    }
    
    setIsSosModalOpen(true);

    const smsMessage = `SECRET DISTRESS ALERT (NEON):
Location: ${userLocation ? `${addressStr} (https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng})` : 'Unknown Location'}
Time: ${new Date().toLocaleTimeString()}
Patient: ${medicalInfo.name || 'BOB'}
Blood Group: ${medicalInfo.bloodGroup || 'O+'}
IMMEDIATE ASSISTANCE REQUIRED. REPLIES EXPECTED.`;

    try {
      // 1. Send SMS to all targets
      await fetch('/api/sos/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          recipients: targetNumbers, 
          message: smsMessage
        })
      });
      
      // Delay slightly between SMS and Calls to ensure Twilio network order
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. Initiate Call concurrently for all targets
      await Promise.all(targetNumbers.map(target => 
        fetch('/api/sos/call-neon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: target, patientName: medicalInfo.name || 'BOB' })
        })
      ));
      
      console.log("[Neon Distress] SMS and Calls sent successfully.");
    } catch (err) {
      console.error("[Neon Distress] Failed to send distress payload.", err);
    } finally {
      setTimeout(() => {
        isBroadcastingRef.current = false;
      }, 30000); 
    }
  };

  const executeDistressBroadcast = async (reason: string, silent: boolean = false, targetOverride?: string) => {
    if (isBroadcastingRef.current) return;
    isBroadcastingRef.current = true;

    if (!silent) {
      setIsSosModalOpen(true);
    }

    saveLogEntry(reason, userLocation);
    // Force the use of the user's verified number for distress protocols
    const targetNumbers = targetOverride ? [targetOverride] : ["+916361892311", "+917892375787"]; 

    
    let addressStr = "Unknown Location";
    let locationDescription = "Location data is currently unavailable.";
    
    if (userLocation) {
      locationDescription = `at latitude ${userLocation.lat.toFixed(6)} and longitude ${userLocation.lng.toFixed(6)}`;
      try {
        const resolvedAddress = await geoapifyService.reverseGeocode(userLocation.lat, userLocation.lng);
        if (resolvedAddress && resolvedAddress !== "Unknown Location") {
          addressStr = resolvedAddress;
          locationDescription = `${resolvedAddress}, at latitude ${userLocation.lat.toFixed(6)} and longitude ${userLocation.lng.toFixed(6)}`;
        }
      } catch (err) {
        console.error("Geocoding failed inside distress broadcast:", err);
      }
    }

    const distressCallMessage = "BOB IN Danger!! BOB Needs help. BOB IN Danger!! BOB Needs help. BOB IN Danger!! BOB Needs help.";
    
    const smsMessage = `DISTRESS ALERT: ${distressCallMessage}
Location: ${userLocation ? `${addressStr} (https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng})` : 'Unknown Location'}
Time: ${new Date().toLocaleTimeString()}
Patient: ${medicalInfo.name}
Patient Phone: ${userPhone || 'Not Provided'}
Blood Group: ${medicalInfo.bloodGroup}
IMMEDIATE ASSISTANCE REQUIRED.
If information is received and ambulance is sent press 1`;

    try {
      if (!silent) {
        speakNotification("Initiating emergency broadcast protocols.");
      }
      
      // Delay slightly so the voice notification isn't abruptly cut off, but do NOT
      // trigger native dialer since we are handling Twilio calls.
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Send SMS
      await fetch('/api/sos/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          recipients: targetNumbers, 
          message: smsMessage 
        })
      });

      // Delay slightly between SMS and Calls to ensure correct delivery order
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Initiate Call concurrently for all targets
      await Promise.all(targetNumbers.map(targetNumber => 
        fetch('/api/sos/call-initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            to: targetNumber,
            message: "Emergency Alert. Patient in danger. Please press 1 to confirm dispatch.",
            host: window.location.origin
          })
        })
      ));

      if (!silent) {
        setIsEmergency(false);
        setInitialVoiceState('DISPATCH_PENDING');
        setIsVoiceActive(true);
      }
    } catch (err) {
      console.error("Broadcast Error:", err);
      if (!silent) {
        speakNotification("Broadcast interference detected. Please use manual override.");
      }
    } finally {
      // Cooldown to prevent spam
      setTimeout(() => {
        isBroadcastingRef.current = false;
      }, 30000); 
    }
  };


  const generatePDFReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Road SOS - Insurance Report", 14, 22);

    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 32);

    doc.setFontSize(16);
    doc.text("Medical Profile", 14, 45);
    
    // AutoTable for Medical Profile
    autoTable(doc, {
      startY: 50,
      head: [['Field', 'Details']],
      body: [
        ['Name', medicalInfo.name || 'N/A'],
        ['Blood Group', medicalInfo.bloodGroup || 'N/A'],
        ['Allergies', medicalInfo.allergies || 'None'],
        ['Emergency Contact', medicalInfo.emergencyContact || 'N/A']
      ],
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246] }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 50;

    doc.text("Recent Accident Logs", 14, finalY + 15);

    const logData = logs.map(log => [
      new Date(log.timestamp).toLocaleString(),
      log.reason,
      log.peakG ? log.peakG.toFixed(2) + 'G' : 'N/A',
      log.location ? `${log.location.lat.toFixed(4)}, ${log.location.lng.toFixed(4)}` : 'Unknown'
    ]);

    autoTable(doc, {
      startY: finalY + 20,
      head: [['Timestamp', 'Reason/Event', 'Peak G-Force', 'Location']],
      body: logData,
      theme: 'striped',
      headStyles: { fillColor: [139, 92, 246] }
    });

    doc.save(`roadsos_insurance_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const initiateDistressBroadcast = (reason: string, silent: boolean = false) => {
    if (isDistressPendingRef.current) return;
    
    if (silent) {
      // Execute immediately without UI updates
      executeDistressBroadcast(reason, true);
      return;
    }

    pendingDistressReasonRef.current = reason;
    setIsDistressPending(true);
    isDistressPendingRef.current = true;
    setCountdownSeconds(5);

    pendingDistressTimerRef.current = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          if (pendingDistressTimerRef.current) clearInterval(pendingDistressTimerRef.current);
          setIsDistressPending(false);
          isDistressPendingRef.current = false;
          executeDistressBroadcast(pendingDistressReasonRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const callNearestHospital = async (forcedTargetNumber: string = "+917892375787") => {
    isBroadcastingRef.current = true;
    const reason = "Severe accident detected via AI intent. Calling nearest hospital.";
    saveLogEntry(reason, userLocation);
    speakNotification("Calling nearest hospital.");

    // Google Places API text search for nearest hospital
    let targetHospitalNumber = forcedTargetNumber;
    let fallbackToForced = true;
    try {
      if (userLocation) {
        const placesUrl = `/api/places/nearby`;
        const headers = { 
          'Content-Type': 'application/json',
          'X-Goog-FieldMask': 'places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber'
        };
        const body = {
          includedTypes: ["hospital"],
          maxResultCount: 1,
          locationRestriction: {
            circle: { center: { latitude: userLocation.lat, longitude: userLocation.lng }, radius: 5000.0 }
          }
        };

        const res = await fetch(placesUrl, { method: 'POST', headers, body: JSON.stringify(body) });
        if (res.ok) {
          const data = await res.json();
          if (data.places && data.places.length > 0) {
            const hospital = data.places[0];
            const phone = hospital.internationalPhoneNumber || hospital.nationalPhoneNumber;
            if (phone) {
               console.log(`[Places API] Nearest Hospital Found: ${hospital.displayName?.text}, Phone: ${phone}`);
               targetHospitalNumber = phone;
               fallbackToForced = false;
            }
          }
        }
      }
    } catch (e) {
      console.error("[Places API] Failed to fetch nearest hospital:", e);
    }
    
    // As per requirement: call +91 7892375787 but display nearest hospital calling.
    targetHospitalNumber = forcedTargetNumber; // Override to strictly call the required specific number, but we kept the fetch logic if we wanted dynamic numbers.

    // Allow executeDistressBroadcast to run
    isBroadcastingRef.current = false;
    await executeDistressBroadcast(`Emergency dispatch to nearest hospital`, false, targetHospitalNumber);
  };

  const handleAIFirstAid = async (incident: string) => {
    try {
      console.log(`[AI First Aid] Requesting instructions for: ${incident}`);
      const cleanInput = incident.toLowerCase().trim();
      let responseToSay = "";

      if (!cleanInput || cleanInput.replace(/\bfirst aid\b/g, "").trim() === "") {
        return; // Ignore if the transcript only consists of wake words
      }

      setIsAIFirstAidActive(true);
      isAIFirstAidActiveRef.current = true;
      setAiFirstAidResponse("Thinking...");

      if (cleanInput.includes("severe accident") || cleanInput.includes("severe injury")) {
        setIsAIFirstAidActive(false);
        isAIFirstAidActiveRef.current = false;
        callNearestHospital();
        return;
      }
      
      const res = await fetch('/api/ai/ask', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ question: incident })
      });
      const data = await res.json();
      responseToSay = data.answer || "Be patient, keep yourself calm, and wait for medical support.";
      
      setAiFirstAidResponse(responseToSay);
      speakNotification(responseToSay);
      saveLogEntry(`AI First Aid intent matched for: ${incident}`, userLocation);
      
      // Reset the timeout so the first-aid session remains open for follow-ups
      if (aiFirstAidTimeoutRef.current) clearTimeout(aiFirstAidTimeoutRef.current);
      aiFirstAidTimeoutRef.current = setTimeout(() => {
        if (isAIFirstAidActiveRef.current) {
          setIsAIFirstAidActive(false);
          isAIFirstAidActiveRef.current = false;
          setAiFirstAidResponse("Listening for incident description...");
          speakNotification("First aid assistant session closed. Stay safe.");
        }
      }, 20000); 

    } catch (err) {
      console.error("AI First Aid Error:", err);
      setIsAIFirstAidActive(false);
      isAIFirstAidActiveRef.current = false;
      setAiFirstAidResponse("Failed to connect");
      speakNotification("I'm sorry, I couldn't reach the medical servers. Please contact emergency services immediately.");
    }
  };

  const [isRecovering, setIsRecovering] = useState(false);
  const safetyWordTimestampsRef = useRef<number[]>([]);
  const rollingTranscriptsRef = useRef<{text: string, time: number}[]>([]);
  const [initialVoiceState, setInitialVoiceState] = useState<'NORMAL' | 'HEARD_HELP' | 'FIRST_AID_ACTIVE' | 'DISPATCH_PENDING' | 'HELP_ARRIVING'>('NORMAL');

  const speakNotification = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Safety Verification Logic
  const startSafetyVerification = () => {
    if (isBroadcastingRef.current || isEmergency || isDistressPendingRef.current) return;
    console.log("[Safety Probe] Starting safety verification due to high G-load.");
    setIsSafetyChecking(true);
    isSafetyCheckingRef.current = true;
    performSafetyProbe(1);
  };

  const performSafetyProbe = (round: number) => {
    if (!isSafetyCheckingRef.current) return;
    
    if (round > 3) {
      failSafetyVerification("No response after 3 safety probes.");
      return;
    }
    
    setSafetyCheckRound(round);
    speakNotification("Are you safe?");
    console.log(`[Safety Probe] Round ${round}/3...`);
    
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    safetyCheckTimerRef.current = setTimeout(() => {
      performSafetyProbe(round + 1);
    }, 5000); 
  };

  const cancelSafetyVerification = () => {
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    setIsSafetyChecking(false);
    isSafetyCheckingRef.current = false;
    setSafetyCheckRound(0);
    speakNotification("Understood. Resuming normal operations.");
    console.log("[Safety Probe] User confirmed safety. Probe cancelled.");
  };

  const failSafetyVerification = (reason: string) => {
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    setIsSafetyChecking(false);
    isSafetyCheckingRef.current = false;
    setSafetyCheckRound(0);
    
    speakNotification("What is the problem?");
    setIsWaitingForIncident(true);
    isWaitingForIncidentRef.current = true;
    console.log(`[Safety Probe] Probe failed: ${reason}. Awaiting incident description.`);
    
    // Auto timeout for incident description - if they don't say anything, send distress anyway
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    safetyCheckTimerRef.current = setTimeout(() => {
        if (isWaitingForIncidentRef.current) {
            handleIncidentResponse("User unresponsive after impact.");
        }
    }, 10000);
  };

  const handleIncidentResponse = (incident: string) => {
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    setIsWaitingForIncident(false);
    isWaitingForIncidentRef.current = false;
    
    console.log(`[Safety Probe] Incident reported: "${incident}". Executing silent SOS.`);
    executeDistressBroadcast(`Auto-Detected Impact Incident: ${incident}`, true);
    handleAIFirstAid(incident);
  };

  const runMLRecovery = async () => {
    setIsRecovering(true);
    // Simulate ML Calibration/Re-binding
    await new Promise(resolve => setTimeout(resolve, 1500));
    const granted = await requestMotionPermission();
    setIsRecovering(false);
    if (granted) {
      speakNotification("Road SOS protection is now active.");
    }
  };

  const triggerSOS = () => {
    if (!isMonitoring) {
      runMLRecovery();
      return;
    }
    initiateDistressBroadcast("Manual SOS Trigger (Long Press)");
  };

  // Background Speech Recognition for Safety Word
  useEffect(() => {
    if (isEmergency || isVoiceActive) {
      if (backgroundRecognitionRef.current) backgroundRecognitionRef.current.stop();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition && isMonitoring) {
      backgroundRecognitionRef.current = new SpeechRecognition();
      backgroundRecognitionRef.current.continuous = true;
      backgroundRecognitionRef.current.interimResults = true;
      backgroundRecognitionRef.current.lang = 'en-US';

      backgroundRecognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript + ' ';
          }
        }
        
        // Normalize transcripts: lowercase and strip all punctuation/special characters
        const normalizeStr = (str: string) => str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        
        const cleanFinal = normalizeStr(finalTranscript);
        const cleanInterim = normalizeStr(interimTranscript);
        const cleanCombined = normalizeStr(finalTranscript + ' ' + interimTranscript);

        // 1. Instant Wake Word Checks (Interim or Final)
        if (cleanCombined.includes("chatbot") || cleanCombined.includes("chat bot")) {
           console.log("[Wake Word] CHATBOT detected, opening Voice Assistant.");
           window.dispatchEvent(new CustomEvent('wake-chatbot'));
           if (backgroundRecognitionRef.current) {
             backgroundRecognitionRef.current.abort();
           }
           return;
        }

        // 2. Cancellation Check (Instant)
        const wantsToCancel = ["cancel", "safe", "stop", "abort", "reset", "wait", "dismiss", "false"].some(word => cleanCombined.includes(word)) || 
                              cleanCombined.includes("i am safe") || 
                              cleanCombined.includes("i'm safe");
        
        if (isDistressPendingRef.current && wantsToCancel) {
          console.log(`[Safety] Voice Cancellation Detected: "${cleanCombined}"`);
          cancelDistress();
          return;
        }

        // Unified Rolling Transcript for Core Panic Words
        if (cleanFinal.length > 0) {
           rollingTranscriptsRef.current.push({ text: cleanFinal, time: Date.now() });
        }
        
        const currentNow = Date.now();
        rollingTranscriptsRef.current = rollingTranscriptsRef.current.filter(x => currentNow - x.time <= 20000);
        const rollingText = rollingTranscriptsRef.current.map(x => x.text).join(' ') + ' ' + cleanInterim;

        const neonRegex = /\b(neon|leon|ne on|knee on|nian|beyond|new one|nyon|neeon)\b/g;
        if ((rollingText.match(neonRegex) || []).length >= 3 && !isBroadcastingRef.current) {
            console.log("CRITICAL: NEON 3x Triggered via Rolling Transcript.");
            saveLogEntry(`Secret word NEON triggered 3 times`, userLocation);
            rollingTranscriptsRef.current = [];
            executeNeonDistress();
            if (backgroundRecognitionRef.current) backgroundRecognitionRef.current.stop();
            return;
        }

        const helpRegex = /\b(help|helps|helping|howp|health)\b/g;
        if ((rollingText.match(helpRegex) || []).length >= 3 && !isBroadcastingRef.current) {
            console.log("CRITICAL: HELP 3x Triggered via Rolling Transcript.");
            saveLogEntry(`Emergency word HELP triggered 3 times`, userLocation);
            rollingTranscriptsRef.current = [];
            executeDistressBroadcast("Voice activated emergency distress alert (HELP spoken 3 times)", false);
            if (backgroundRecognitionRef.current) backgroundRecognitionRef.current.stop();
            return;
        }

        const faRegex = /\bfirst aid\b/g;
        const faMatches = (rollingText.match(faRegex) || []).length;
        if (faMatches >= 2 && !isAIFirstAidActiveRef.current) {
            console.log("CRITICAL: FIRST AID 2x Triggered via Rolling Transcript.");
            
            // Check if the user supplied text AFTER "first aid" in the same breath
            const splitText = rollingText.split(/\bfirst aid\b/); 
            const trailingText = splitText[splitText.length - 1].trim();

            rollingTranscriptsRef.current = [];
            setIsAIFirstAidActive(true);
            isAIFirstAidActiveRef.current = true;

            if (trailingText.length > 5) {
                // User already provided the incident desc
                handleAIFirstAid(trailingText);
            } else {
                // Ask what happened
                speakNotification("I heard you need first aid. What happened?");
                setAiFirstAidResponse("I heard you need first aid. What happened?");
                if (aiFirstAidTimeoutRef.current) clearTimeout(aiFirstAidTimeoutRef.current);
                aiFirstAidTimeoutRef.current = setTimeout(() => {
                  if (isAIFirstAidActiveRef.current) {
                    setIsAIFirstAidActive(false);
                    isAIFirstAidActiveRef.current = false;
                    speakNotification("First aid assistant timed out.");
                  }
                }, 15000);
            }
            if (backgroundRecognitionRef.current) backgroundRecognitionRef.current.stop();
            return;
        }

        const safeWordNormalized = safetyWord.toLowerCase().trim();
        if (safeWordNormalized.length > 0) {
            const matches = (rollingText.match(new RegExp(`\\b${safeWordNormalized}\\b`, 'g')) || []).length;
            if (matches >= 3 && !isBroadcastingRef.current) {
                console.log(`CRITICAL: Safety Word (${safetyWord}) 3x Triggered via Rolling Transcript.`);
                rollingTranscriptsRef.current = [];
                initiateDistressBroadcast(`Safety Word (${safetyWord} x3) Activation`, true);
                if (backgroundRecognitionRef.current) backgroundRecognitionRef.current.stop();
                return;
            }
        }

        // 3. Process robust occurrences on FINALized results (to prevent duplicate interim counts)
        if (cleanFinal.length > 0) {
           // Handle Safety Verification Flow responses
           if (isSafetyCheckingRef.current) {
             if (cleanFinal.includes("yes i am safe") || cleanFinal.includes("i am safe") || cleanFinal.includes("i'm safe") || cleanFinal === "safe") {
               cancelSafetyVerification();
               return;
             }
             if (cleanFinal.includes("danger") || cleanFinal.includes("help") || cleanFinal.includes("not safe")) {
               failSafetyVerification("User reported danger/help during probe.");
               return;
             }
           }

           if (isWaitingForIncidentRef.current) {
             handleIncidentResponse(cleanFinal);
             return;
           }

           // Voice Controls for Features (Alexa style)
           if (cleanFinal.includes("open voice assistant") || cleanFinal.includes("open chatbot") || cleanFinal.includes("start voice assistant")) {
             setIsVoiceActive(true);
             speakNotification("Voice assistant opened. How can I help you?");
           } else if (cleanFinal.includes("close voice assistant") || cleanFinal.includes("close chatbot") || cleanFinal.includes("stop voice assistant")) {
             setIsVoiceActive(false);
             speakNotification("Voice assistant closed.");
           }
           
           if (cleanFinal.includes("open traffic") || cleanFinal.includes("open map") || cleanFinal.includes("show map")) {
             setShowTrafficMap(true);
             speakNotification("Map view opened.");
           } else if (cleanFinal.includes("close traffic") || cleanFinal.includes("close map") || cleanFinal.includes("hide map")) {
             setShowTrafficMap(false);
             setTrafficUpdate(null);
             speakNotification("Map view closed.");
           }

           if (isWaitingForEmergencyChoiceRef.current) {
             if (cleanFinal.includes("emergency") || cleanFinal.includes("number") || cleanFinal.includes("contact")) {
               isWaitingForEmergencyChoiceRef.current = false;
               speakNotification("Calling emergency contact.");
               executeDistressBroadcast("User requested emergency contact via voice", false, "+916361892311");
               return;
             } else if (cleanFinal.includes("nearest") || cleanFinal.includes("hospital")) {
               isWaitingForEmergencyChoiceRef.current = false;
               speakNotification("Calling nearest hospital.");
               // It calls the specific number but displays the name via Places API in callNearestHospital
               callNearestHospital("+917892375787"); 
               return;
             }
           }

           if (cleanFinal.includes("i had an accident") || cleanFinal.includes("had an accident") || cleanFinal === "accident") {
             isWaitingForEmergencyChoiceRef.current = true;
             speakNotification("Should I contact emergency number or nearest hospital?");
             return;
           }

           // App UI Commands
           if (cleanFinal === "hello" || cleanFinal.includes("hello")) {
               console.log("Voice Command: Hello");
               speakNotification("HEILO bob how are you doing!");
           }

           if (cleanFinal === "refresh" || cleanFinal.includes("refresh the app") || cleanFinal.includes("refresh page")) {
               console.log("Voice Command: Refresh");
               speakNotification("Refreshing the application.");
               setTimeout(() => {
                 window.location.reload();
               }, 1000);
           }

           const getUpdateMatch = cleanFinal.match(/(?:get updates|get updates ones|get update|traffic updates?)(?:\s+(?:about|on|in|for|at)\s+(.+))?/i);
           if (getUpdateMatch) {
               console.log("Voice Command: Get Updates");
               const locationName = getUpdateMatch[1];
               if (locationName) {
                 speakNotification(`Getting traffic updates for ${locationName}`);
               } else {
                 speakNotification(`Getting traffic updates for your current location`);
               }
               fetchTrafficUpdates(locationName);
               const uiEl = document.getElementById("traffic-updates-section");
               if (uiEl) uiEl.scrollIntoView({ behavior: 'smooth' });
           }

           if (cleanFinal.includes("go to map search")) {
               console.log("Voice Command: Go to Map Search");
               isWaitingForMapSearchRef.current = true;
               const mapEl = document.getElementById("google-map-section");
               if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
               speakNotification("Say a place name to search.");
           } else if (isWaitingForMapSearchRef.current && cleanFinal.trim().length > 0) {
               console.log("Voice Map Search Query:", cleanFinal);
               setVoiceMapQuery(cleanFinal.trim());
               isWaitingForMapSearchRef.current = false;
               speakNotification(`Searching map for ${cleanFinal.trim()}`);
           }

           if (isAIFirstAidActiveRef.current) {
             if (aiFirstAidTimeoutRef.current) clearTimeout(aiFirstAidTimeoutRef.current);
             console.log(`[AI First Aid] Processing incident: "${cleanFinal}"`);
             handleAIFirstAid(cleanFinal);
             return; // Stop processing further commands once we consume this for AI
           }
         }
      };

      backgroundRecognitionRef.current.onend = () => {
        if (isMonitoring && !isEmergency && !isVoiceActive && !isChatbotModalOpen) {
          try {
            backgroundRecognitionRef.current.start();
          } catch (e) {
            console.log("Background Voice Restarting...");
          }
        }
      };

      try {
        if (!isChatbotModalOpen) {
          backgroundRecognitionRef.current.start();
        }
      } catch (e) {
        console.error("Speech Recognition Start Error:", e);
      }
    }

    return () => {
      if (backgroundRecognitionRef.current) backgroundRecognitionRef.current.stop();
    };
  }, [isEmergency, isVoiceActive, isMonitoring, safetyWord, isChatbotModalOpen]);

  useEffect(() => {
    // Check if motion is supported
    if (!window.DeviceMotionEvent) {
      setMotionPermission('unsupported');
    }
  }, []);

  useEffect(() => {
    // GPS Fix with timeout fallback to ensure maps function immediately in a sandboxed preview or closed space
    const fallbackTimer = setTimeout(() => {
      setUserLocation(prev => {
        if (!prev) {
          console.log("[GPS Fallback] Geolocation timed out, choosing default coordinates");
          return { lat: 12.971598, lng: 77.594566 }; // Default Bangalore Central
        }
        return prev;
      });
    }, 4000);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        clearTimeout(fallbackTimer);
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        console.warn("[GPS Fallback Alert] Geolocation failed:", err);
        clearTimeout(fallbackTimer);
        setUserLocation(prev => prev || { lat: 12.971598, lng: 77.594566 });
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );

    return () => {
      clearTimeout(fallbackTimer);
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (!isMonitoring) return;

    // Accelerometer
    const handleMotion = (e: DeviceMotionEvent) => {
      if (e.accelerationIncludingGravity) {
        const { x, y, z } = e.accelerationIncludingGravity;
        const curX = x || 0;
        const curY = y || 0;
        const curZ = z || 0;
        
        setTelemetry({ x: curX, y: curY, z: curZ });
        
        const g = Math.sqrt(curX**2 + curY**2 + curZ**2) / 9.81;
        setPeakG(current => g > current ? g : current);
        
        setHistory(prev => {
          const nextId = prev.length > 0 ? (prev[prev.length - 1].id + 1) : 0;
          const next = [...prev, { g, time: Date.now(), id: nextId }];
          if (next.length > 30) return next.slice(1);
          return next;
        });

        if (g > 6.0 && !isEmergency && !isDistressPendingRef.current) {
          console.log("[Crash Detection] Critical G-force exceeded (>6G). Triggering immediate broadcast.");
          initiateDistressBroadcast("Auto-Detected Severe Impact (>6G)", true);
        } else if (g > 4.0 && !isSafetyCheckingRef.current && !isEmergency && !isDistressPendingRef.current) {
          startSafetyVerification();
        }
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [isMonitoring]);

  const requestMotionPermission = async () => {
    try {
      // iOS 13+ requires explicit permission
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        const response = await (DeviceMotionEvent as any).requestPermission();
        if (response === 'granted') {
          setMotionPermission('granted');
          setIsMonitoring(true);
          return true;
        } else {
          setMotionPermission('denied');
          return false;
        }
      } else {
        // Non-iOS or older versions
        setMotionPermission('granted');
        setIsMonitoring(true);
        return true;
      }
    } catch (e) {
      console.error("Motion Permission Error:", e);
      setMotionPermission('unsupported');
      return false;
    }
  };

  const triggerMockCrash = () => {
    setPeakG(4.5);
    initiateDistressBroadcast("Simulated High-Impact Crash (>4G)");
  };

  const handleDispatchComplete = (data: any) => {
    setIsVoiceActive(false);
    setDispatchData({
      payload: JSON.stringify(data),
      facilityName: data.facility.name,
      facilityLocation: data.facility.location,
      userLocation: userLocation,
      userAddress: data.facility.address || "Current GPS Location"
    });
  };

  if (!setupComplete) {
    return <PermissionsModal onComplete={(phone) => { setUserPhone(phone); setSetupComplete(true); }} />;
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
        <AnimatePresence mode="wait">
          {isEmergency && (
            <EmergencyUI 
              key="emergency-overlay"
              autoTriggered={true}
              onCancel={() => setIsEmergency(false)}
              onConfirm={() => {
                setIsEmergency(false);
                setIsVoiceActive(true);
              }}
            />
          )}
          {isSafetyChecking && (
            <motion.div 
              key="safety-probe-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-6 text-white"
            >
              <div className="max-w-md w-full text-center">
                <motion.div 
                  animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-48 h-48 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-12 border border-red-500/20"
                >
                  <Activity className="text-red-500" size={64} />
                </motion.div>
                <h2 className="text-sm font-black mb-2 uppercase tracking-[0.4em] text-red-500">High G-Load Detected</h2>
                <h3 className="text-3xl font-black mb-8 tracking-tighter">ARE YOU SAFE?</h3>
                <p className="text-[10px] font-mono text-slate-400 mb-8 uppercase tracking-widest leading-relaxed">
                  Attempt {safetyCheckRound} of 3
                  <br/>
                  <span className="text-blue-400 animate-pulse">Speak: "YES I AM SAFE"</span>
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={cancelSafetyVerification}
                    className="flex-1 py-5 bg-white text-black font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl text-[10px]"
                  >
                    I AM SAFE
                  </button>
                  <button 
                    onClick={() => failSafetyVerification("Manual Fail")}
                    className="flex-1 py-5 bg-red-600 text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl text-[10px]"
                  >
                    I NEED HELP
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          {isWaitingForIncident && (
            <motion.div 
              key="incident-description-overlay"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6"
            >
              <div className="max-w-md w-full bg-slate-900 border border-blue-500/30 p-10 rounded-[40px] shadow-2xl text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse" />
                <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-blue-500/30">
                  <AlertCircle className="text-blue-500 animate-pulse" size={40} />
                </div>
                <h2 className="text-2xl font-black mb-4 tracking-tighter text-white">WHAT IS THE PROBLEM?</h2>
                <p className="text-slate-400 text-sm mb-8 font-mono uppercase tracking-widest animate-pulse">
                  Describing incident for first responders...
                </p>
                <div className="bg-slate-950 p-4 rounded-2xl border border-white/5 text-[10px] text-slate-500 uppercase tracking-[0.2em]">
                  Speak clearly now
                </div>
              </div>
            </motion.div>
          )}
          {isDistressPending && (
            <motion.div 
              key="distress-countdown"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-6 text-white"
            >
              <div className="max-w-md w-full text-center">
                <motion.div 
                  animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-48 h-48 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-12 border border-blue-500/20"
                >
                  <div className="w-32 h-32 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/30">
                    <span className="text-4xl font-mono text-blue-400 font-black">{countdownSeconds}</span>
                  </div>
                </motion.div>
                <h2 className="text-sm font-black mb-2 uppercase tracking-[0.4em] text-slate-500">Security Pulse Active</h2>
                <p className="text-[10px] font-mono text-slate-400 mb-8 uppercase tracking-widest leading-relaxed">
                  Verifying inertial telemetry...
                  <br/>
                  <span className="text-blue-400 animate-pulse">Listening for: "CANCEL" or "I AM SAFE"</span>
                </p>
                <button 
                  onClick={cancelDistress}
                  className="w-full py-5 bg-slate-900 text-slate-500 font-black uppercase tracking-[0.2em] rounded-2xl border border-white/5 hover:bg-slate-800 transition-all text-[10px]"
                >
                  Authorize System Override
                </button>
              </div>
            </motion.div>
          )}
          {isAIFirstAidActive && (
            <motion.div 
              key="ai-first-aid-overlay"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6"
            >
              <div className="max-w-md w-full bg-slate-900 border border-emerald-500/30 p-10 rounded-[40px] shadow-2xl text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 animate-pulse" />
                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-emerald-500/30">
                  <Activity className="text-emerald-500 animate-pulse" size={40} />
                </div>
                <h2 className="text-2xl font-black mb-4 tracking-tighter text-white">AI FIRST AID ACTIVE</h2>
                <div className="bg-slate-800/50 p-6 rounded-2xl border border-white/5 mb-8">
                  <p className="text-emerald-400 font-medium text-lg leading-relaxed">
                    {aiFirstAidResponse}
                  </p>
                </div>
                <div className="bg-slate-950 p-4 rounded-2xl border border-white/5 text-[10px] text-slate-500 uppercase tracking-[0.2em]">
                  Speak clearly: "My arm is bleeding", "I have a headache", etc.
                </div>
                <button 
                  onClick={() => {
                    setIsAIFirstAidActive(false);
                    isAIFirstAidActiveRef.current = false;
                    speakNotification("First aid assistant session closed. Stay safe.");
                  }}
                  className="mt-6 w-full py-4 bg-slate-800 text-slate-400 font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-slate-700 transition-all text-xs"
                >
                  Close Assistant
                </button>
              </div>
            </motion.div>
          )}
          {isVoiceActive && (
            <VoiceInterface 
              key="voice-interface"
              userLocation={userLocation}
              onLogEvent={(reason) => saveLogEntry(reason, userLocation)}
              onBack={() => {
                setIsVoiceActive(false);
                setInitialVoiceState('NORMAL');
              }}
              onDispatchComplete={handleDispatchComplete}
              initialEmergencyState={initialVoiceState}
            />
          )}
          {isChatbotModalOpen && (
            <ChatbotModal 
              key="chatbot-modal"
              onClose={() => setIsChatbotModalOpen(false)}
              userLocation={userLocation}
              onTriggerDispatch={(type) => {
                executeDistressBroadcast(type || "Voice AI distress", false);
                setIsChatbotModalOpen(false);
              }}
              onMapNearestHospital={() => {
                setVoiceMapQuery("hospital");
                setShowTrafficMap(false);
                setIsChatbotModalOpen(false);
                setTimeout(() => {
                  const mapEl = document.getElementById("google-map-section");
                  if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
                }, 300);
              }}
              onToggleTraffic={(state) => {
                setShowTrafficMap(state);
                setIsChatbotModalOpen(false);
                setTimeout(() => {
                  const mapEl = document.getElementById("google-map-section");
                  if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
                }, 300);
              }}
            />
          )}
          {dispatchData && (
            <DispatchSummary
              key="dispatch-summary"
              payload={dispatchData.payload}
              facilityName={dispatchData.facilityName}
              facilityLocation={dispatchData.facilityLocation}
              userLocation={userLocation || dispatchData.userLocation}
              userAddress={dispatchData.userAddress}
              onFinish={() => {
                setDispatchData(null);
                setPeakG(1.0);
              }}
            />
          )}
        </AnimatePresence>
        
        <HazardMonitor />

        <div className="fixed bottom-8 right-8 z-30">
          <SOSTrigger onTrigger={triggerSOS} isPulsing={isEmergency || isWaitingForIncident || isDistressPending} />
        </div>

        <main className="max-w-2xl mx-auto p-6 md:p-12">
          {/* Confirmed Help Banner */}
          <AnimatePresence>
             {isConfirmedHelpArriving && (
                <motion.div 
                   initial={{ opacity: 0, y: -20, scale: 0.95 }}
                   animate={{ opacity: 1, y: 0, scale: 1 }}
                   exit={{ opacity: 0, y: -20, scale: 0.95 }}
                   className="mb-8 p-6 bg-green-500 text-white rounded-3xl shadow-[0_0_40px_rgba(34,197,94,0.4)] flex items-center justify-between border border-green-400/50"
                >
                   <div className="flex items-center gap-4">
                     <div className="p-3 bg-white/20 rounded-2xl">
                       <ShieldCheck size={32} className="text-white" />
                     </div>
                     <div>
                       <h2 className="text-3xl font-black uppercase tracking-tight">HELP IS COMING!!</h2>
                       <p className="text-green-100 font-medium">Please stay calm and do not panic. Responders have acknowledged the emergency.</p>
                     </div>
                   </div>
                   <button onClick={() => setIsConfirmedHelpArriving(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                     <X size={24} />
                   </button>
                </motion.div>
             )}
          </AnimatePresence>

          {/* Neon Confirmed Banner */}
          <AnimatePresence>
             {isConfirmedNeon && (
                <motion.div 
                   initial={{ opacity: 0, y: -20, scale: 0.95 }}
                   animate={{ opacity: 1, y: 0, scale: 1 }}
                   exit={{ opacity: 0, y: -20, scale: 0.95 }}
                   className="mb-8 p-6 bg-purple-600 text-white rounded-3xl shadow-[0_0_40px_rgba(147,51,234,0.4)] flex items-center justify-between border border-purple-400/50"
                >
                   <div className="flex items-center gap-4">
                     <div className="p-3 bg-white/20 rounded-2xl">
                       <Zap size={32} className="text-white animate-pulse" />
                     </div>
                     <div>
                       <h2 className="text-3xl font-black uppercase tracking-tight">NEON ACKNOWLEDGED</h2>
                       <p className="text-purple-100 font-medium">Your trusted contact has received your distress signal.</p>
                     </div>
                   </div>
                   <button onClick={() => setIsConfirmedNeon(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                     <X size={24} />
                   </button>
                </motion.div>
             )}
          </AnimatePresence>

          <header className="mb-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
                <ShieldCheck className="text-blue-500" />
                RoadSoS <span className="text-slate-500 font-normal">v1.0-alpha</span>
              </h1>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <p className="text-sm text-slate-400 font-mono uppercase tracking-widest hidden sm:block">
                  Trauma & Rescue Network
                </p>
                <div className="h-1 w-1 rounded-full bg-slate-700 hidden sm:block" />
                <BatteryIndicator />
                <div className="flex items-center gap-2">
                   {isMonitoring ? (
                     <div className="flex items-center gap-2 px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-md">
                        <div className="w-1 h-1 rounded-full bg-cyan-500 animate-pulse" />
                        <span className="text-[8px] font-black text-cyan-500 uppercase tracking-widest">Live Monitoring Active</span>
                     </div>
                   ) : (
                     <button 
                        onClick={runMLRecovery}
                        className="flex items-center gap-2 px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded-md hover:bg-red-500/30 transition-all cursor-pointer group animate-pulse"
                     >
                        <div className="w-1 h-1 rounded-full bg-red-500" />
                        <span className="text-[8px] font-black text-red-500 uppercase tracking-widest group-hover:text-white transition-colors">
                          System Inactive: Tap to Calibrate
                        </span>
                     </button>
                   )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 text-right">
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsChatbotModalOpen(true)}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2 border border-white/10"
                >
                  <Bot size={14} />
                  Chatbot
                </button>
                <button 
                  onClick={toggleDrivingMode}
                  className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-2 ${
                    isDrivingMode 
                      ? 'bg-amber-500 text-slate-950 shadow-amber-500/30' 
                      : 'bg-slate-900 border border-white/5 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Navigation size={14} className={isDrivingMode ? 'animate-bounce' : ''} />
                  {isDrivingMode ? 'Driving: Do Not Disturb' : 'Driving Mode: OFF'}
                </button>
              </div>
              
              {!isMonitoring && motionPermission !== 'unsupported' && (
                <button 
                  onClick={requestMotionPermission}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 border border-white/10"
                >
                  <Activity size={14} className="animate-spin-slow" />
                  Request Sensor Access
                </button>
              )}
            </div>
          </header>

          <AnimatePresence>
            {showOnboarding && !isEmergency && !isVoiceActive && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-slate-950 flex items-center justify-center p-6"
              >
                <div className="max-w-md w-full bg-slate-900 border border-white/5 p-8 rounded-[40px] shadow-2xl text-center relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-full h-full bg-blue-500/5 pointer-events-none" />
                   <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px]" />
                   
                   <div className="relative z-10">
                     <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl rotate-3">
                        <ShieldCheck className="text-white" size={40} />
                     </div>
                     <h2 className="text-3xl font-black mb-4 tracking-tighter italic">WELCOME TO ROADSOS</h2>
                     <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                        Your autonomous safety net. Before we start monitoring your transit, please memorize your <b>Safety Word</b>.
                     </p>
                     
                     <div className="bg-slate-950 border border-blue-500/30 p-6 rounded-3xl mb-8 group">
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-3">Distress Safety Word</p>
                        <h3 className="text-5xl font-black tracking-widest text-white">{safetyWord}</h3>
                        <p className="text-[9px] text-slate-500 mt-4 uppercase font-bold tracking-widest">Repeat 3 times in quick succession to trigger SOS</p>
                     </div>

                     <button 
                       onClick={() => {
                         setShowOnboarding(false);
                         runMLRecovery();
                       }}
                       className="w-full py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all text-xs"
                     >
                       I've Memorized it & Enable Protection
                     </button>
                     
                     <p className="text-[9px] text-slate-600 mt-6 uppercase tracking-widest leading-relaxed">
                       This word will be hidden from the UI for your security.<br/>
                       It should only be used in genuine distress situations.
                     </p>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!isMonitoring && !showOnboarding && (
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="mb-8 p-10 bg-gradient-to-br from-red-600 to-red-700 rounded-[3rem] border-4 border-white/20 shadow-[0_30px_60px_-15px_rgba(220,38,38,0.5)] relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.2),transparent)] pointer-events-none" />
                <div className="relative z-10 flex flex-col items-center text-center gap-8">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl animate-bounce">
                    <Zap className="text-red-600" size={40} />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2">System Suspended</h3>
                    <div className="inline-block px-4 py-1.5 bg-black/30 backdrop-blur-md rounded-full border border-white/10 mb-4">
                      <p className="text-[10px] font-black text-red-100 uppercase tracking-[0.3em]">Protection is currently OFFLINE</p>
                    </div>
                    <p className="text-base text-red-50 font-medium max-w-sm leading-tight opacity-90">
                      We cannot detect accidents or voice distress without your permission.
                    </p>
                  </div>
                  <button 
                    onClick={runMLRecovery}
                    disabled={isRecovering}
                    className="w-full py-6 bg-white text-red-600 font-black uppercase tracking-[0.25em] rounded-[1.5rem] shadow-[0_20px_40px_rgba(0,0,0,0.3)] hover:scale-[1.03] active:scale-95 transition-all text-sm border-b-4 border-red-100 flex items-center justify-center gap-3"
                  >
                    {isRecovering ? (
                      <>
                        <Activity className="animate-spin" size={20} />
                        RE-BINDING PROTECTION...
                      </>
                    ) : (
                      'ENABLE PROTECTION NOW'
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isDrivingMode && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-8 overflow-hidden"
              >
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-slate-950">
                         <Navigation size={24} />
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Status: Active Transit</p>
                         <h4 className="text-sm font-bold">Auto-Reply: "User is currently driving"</h4>
                      </div>
                   </div>
                   <button 
                      onClick={() => setShowDrivingSimulator(true)}
                      className="px-3 py-1.5 bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-widest rounded-lg"
                   >
                     Test Call
                   </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {showDrivingSimulator && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
               <motion.div 
                 initial={{ scale: 0.9, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 className="bg-slate-900 border border-slate-800 p-8 rounded-3xl w-full max-w-sm text-center shadow-2xl"
               >
                  <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                     <PhoneCall size={40} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-black mb-2">Simulated Incoming Call</h3>
                  <p className="text-slate-400 text-sm mb-6">Dispatch or Contact is trying to reach you...</p>
                  <div className="bg-slate-950 border border-white/5 p-4 rounded-2xl mb-8">
                     <p className="text-xs font-mono text-amber-500 uppercase tracking-widest mb-2">Auto-Message Sent:</p>
                     <p className="text-sm italic font-medium">"I am currently driving/riding my vehicle and using RoadSOS. Please hold or I will call back shortly."</p>
                  </div>
                  <button 
                    onClick={() => setShowDrivingSimulator(false)}
                    className="w-full py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-sm font-black uppercase tracking-widest"
                  >
                    Close Simulator
                  </button>
               </motion.div>
            </div>
          )}

          <section id="traffic-updates-section" className="mb-8 flex flex-col gap-4 w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900 border border-slate-800 p-4 rounded-3xl gap-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300">Live Traffic & Hazards</h3>
                <p className="text-[10px] text-slate-500 max-w-[200px] mt-1">Get real-time accident and closure reports near your location via Google Search Grounding API.</p>
              </div>
              <button 
                onClick={() => fetchTrafficUpdates()}
                disabled={fetchingTraffic || !userLocation}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all w-full sm:w-auto"
              >
                {fetchingTraffic ? 'Fetching...' : 'Get Updates'}
              </button>
            </div>
            
            {trafficUpdate && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl text-sm text-amber-300 mb-2 whitespace-pre-wrap">
                {trafficUpdate}
              </div>
            )}

            <div id="google-map-section">
              {userLocation ? (
                <GoogleMapComponent 
                  center={userLocation} 
                  zoom={15} 
                  markers={[{ ...userLocation, title: 'You', color: '#3b82f6' }]}
                  showTrafficLayer={showTrafficMap}
                  voiceMapQuery={voiceMapQuery}
                />
              ) : (
                <div className="overflow-hidden rounded-3xl border border-slate-800 shadow-2xl bg-slate-900 h-[300px] relative w-full flex flex-col items-center justify-center gap-3">
                  <div className="animate-spin text-blue-500">
                    <Navigation size={32} />
                  </div>
                  <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Waiting for GPS Fix...</p>
                  
                  <div className="absolute top-4 right-4 z-10 flex gap-2">
                    <div className="bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-mono font-bold text-blue-400">
                      LIVE SIGNAL
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl overflow-hidden relative flex flex-col">
              <div className="flex items-start justify-between mb-8 relative z-10">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Activity size={18} />
                    <span className="text-sm font-bold uppercase tracking-tight">System Telemetry</span>
                  </div>
                  <p className="text-[9px] font-mono text-slate-500 mt-1 uppercase tracking-widest">Active Inertial Data</p>
                </div>
                <div className="flex items-center gap-2 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-md">
                   <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                   <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Real-time</span>
                </div>
              </div>
              
              {/* Motion Visualizer Blob */}
              <div className="absolute top-0 right-0 w-32 h-32 opacity-10 pointer-events-none">
                 <motion.div 
                    animate={{ 
                      x: telemetry.x * 2, 
                      y: telemetry.y * 2,
                      scale: 1 + (Math.abs(telemetry.z - 9.8) / 10)
                    }}
                    className="w-full h-full bg-blue-500 rounded-full blur-3xl"
                 />
              </div>

              <div className="flex items-end justify-between relative z-10 mb-6">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">G-Load</p>
                  <h2 className="text-5xl font-black text-blue-400 font-mono">
                    {(Math.sqrt(telemetry.x**2 + telemetry.y**2 + telemetry.z**2) / 9.81).toFixed(2)}G
                  </h2>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">PEAK IMPACT</p>
                  <p className="text-2xl font-bold text-red-500 font-mono">{peakG.toFixed(1)}G</p>
                </div>
              </div>

              <div className="flex-1 min-h-[100px] mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <YAxis hide domain={[0, 5]} />
                    <Line 
                      type="monotone" 
                      dataKey="g" 
                      stroke="#3b82f6" 
                      strokeWidth={3} 
                      dot={false} 
                      animationDuration={300}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden relative z-10">
                <motion.div 
                   animate={{ width: `${Math.min(100, (Math.sqrt(telemetry.x**2 + telemetry.y**2 + telemetry.z**2) / 9.81) * 20)}%` }}
                   className={`h-full ${peakG > 3 ? 'bg-red-500' : 'bg-blue-500'} shadow-[0_0_10px_rgba(59,130,246,0.5)]`}
                />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-red-500/5 pointer-events-none" />
              <div className="z-10 text-center mb-6">
                <div className="flex items-center justify-center gap-2 text-slate-400 mb-2">
                  <Zap size={18} />
                  <span className="text-sm font-bold uppercase tracking-tight">Rapid Response</span>
                </div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-relaxed">
                  Hold for 5s to initiate manual<br/>distress broadcast
                </p>
              </div>
              
              <div className="z-10 bg-slate-950 p-4 rounded-full border border-white/5 shadow-inner">
                <SOSTrigger onTrigger={triggerSOS} isPulsing={isEmergency || isWaitingForIncident || isDistressPending} />
              </div>

              {!isMonitoring && (
                <button 
                  onClick={runMLRecovery}
                  disabled={isRecovering}
                  className="mt-4 z-10 w-full py-3 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-cyan-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <Activity size={14} className={isRecovering ? 'animate-spin' : ''} />
                  {isRecovering ? 'Calibrating ML Models...' : 'Run ML Auto-Recovery'}
                </button>
              )}

              <button 
                onClick={triggerMockCrash}
                className="mt-6 z-10 text-[10px] font-black text-red-500/50 hover:text-red-500 uppercase tracking-widest transition-colors"
              >
                Mock Crash Sensor
              </button>
            </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-xl">
                  <ShieldCheck className="text-red-500" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Medical Profile</h3>
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Crucial First-Responder Data</p>
                </div>
              </div>
              <button 
                onClick={() => setShowMedicalProfile(!showMedicalProfile)}
                className="text-[10px] font-black text-blue-500 uppercase tracking-widest px-4 py-2 bg-blue-500/10 rounded-full border border-blue-500/20 hover:bg-blue-500/20 transition-all"
              >
                {showMedicalProfile ? 'Save & Close' : 'Update Info'}
              </button>
            </div>

            {showMedicalProfile ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Full Name</label>
                    <input 
                      type="text" 
                      value={medicalInfo.name}
                      onChange={(e) => setMedicalInfo({...medicalInfo, name: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Blood Group</label>
                    <input 
                      type="text" 
                      value={medicalInfo.bloodGroup}
                      onChange={(e) => setMedicalInfo({...medicalInfo, bloodGroup: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                   <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Emergency Contact</label>
                    <input 
                      type="text" 
                      value={medicalInfo.emergencyContact}
                      onChange={(e) => setMedicalInfo({...medicalInfo, emergencyContact: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Known Allergies</label>
                    <input 
                      type="text" 
                      value={medicalInfo.allergies}
                      onChange={(e) => setMedicalInfo({...medicalInfo, allergies: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-6 flex flex-wrap gap-x-12 gap-y-6">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Holder</p>
                  <p className="text-sm font-black text-white">{medicalInfo.name}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Blood</p>
                  <p className="text-sm font-black text-red-500">{medicalInfo.bloodGroup}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Contact</p>
                  <p className="text-sm font-black text-white">{medicalInfo.emergencyContact}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Allergies</p>
                  <p className="text-sm font-black text-white">{medicalInfo.allergies}</p>
                </div>
              </div>
            )}
          </section>



          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-xl">
                  <ClipboardList className="text-emerald-500" size={24} />
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight">First-Aid Guide</h3>
              </div>
              <button 
                onClick={() => setShowTraumaGuide(!showTraumaGuide)}
                className="text-[10px] font-black text-emerald-500 uppercase tracking-widest"
              >
                {showTraumaGuide ? 'Collapse' : 'Open Guide'}
              </button>
            </div>
            
            {showTraumaGuide && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="p-4 bg-slate-950/50 border border-white/5 rounded-2xl flex gap-4">
                  <div className="bg-emerald-500/10 p-2 h-fit rounded-lg"><Info size={16} className="text-emerald-500" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Severe Bleeding</h4>
                    <p className="text-[11px] text-slate-400">Apply direct pressure with clean cloth. Elevate wound. Do not remove soaked cloth, add more on top.</p>
                  </div>
                </div>
                <div className="p-4 bg-slate-950/50 border border-white/5 rounded-2xl flex gap-4">
                  <div className="bg-amber-500/10 p-2 h-fit rounded-lg"><AlertCircle size={16} className="text-amber-500" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Unconscious Patient</h4>
                    <p className="text-[11px] text-slate-400">Check airway. Tilt head back slightly. Check breathing. Do not move if spinal injury suspected.</p>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8">
             <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 rounded-xl">
                    <FileText className="text-purple-500" size={24} />
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Accident Logs</h3>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    className="text-[10px] font-black text-purple-500 uppercase tracking-widest px-4 py-2 bg-purple-500/10 rounded-full border border-purple-500/20 hover:bg-purple-500/20 transition-all"
                    onClick={() => {
                      const data = JSON.stringify({ medicalInfo, logs }, null, 2);
                      const blob = new Blob([data], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `roadsos_report_${new Date().toLocaleDateString()}.json`;
                      a.click();
                    }}
                  >
                    Export JSON
                  </button>
                  <button 
                    className="text-[10px] font-black text-emerald-500 uppercase tracking-widest px-4 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                    onClick={generatePDFReport}
                  >
                    Generate PDF Report
                  </button>
                </div>
             </div>

             <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
               {logs.length > 0 ? (
                 logs.map((log, idx) => (
                   <div key={`${log.id}-${idx}`} className="bg-slate-950/50 border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-purple-500/30 transition-all">
                      <div>
                        <p className="text-[9px] font-mono text-purple-400 uppercase tracking-widest mb-1 italic">
                          {new Date(log.timestamp).toLocaleString()}
                        </p>
                        <h4 className="text-xs font-bold text-white mb-1">{log.reason}</h4>
                        <div className="flex gap-4">
                          <p className="text-[9px] text-slate-500">Impact: <span className="text-red-400 font-bold">{log.peakG.toFixed(1)}G</span></p>
                        </div>
                      </div>
                      <ChevronRight className="text-slate-800 group-hover:text-purple-500 transition-colors" size={16} />
                   </div>
                 ))
               ) : (
                 <div className="text-center py-12">
                   <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">No Incident Reports Logged</p>
                 </div>
               )}
             </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500/20 rounded-xl">
                <Zap className="text-blue-500" size={24} />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight">Active Roadmap</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                <p className="text-blue-400 font-black text-[10px] uppercase tracking-widest mb-2">Beta v1.0</p>
                <h4 className="text-sm font-bold text-white mb-1">Accident History Log</h4>
                <p className="text-[10px] text-slate-400">Black-box style recording implemented and persistent.</p>
              </div>
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                <p className="text-emerald-400 font-black text-[10px] uppercase tracking-widest mb-2">Beta v1.0</p>
                <h4 className="text-sm font-bold text-white mb-1">AI First-Aid Guide</h4>
                <p className="text-[10px] text-slate-400">Visual trauma protocols integrated into dispatcher UI.</p>
              </div>
              <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                <p className="text-purple-400 font-black text-[10px] uppercase tracking-widest mb-2">Beta v1.0</p>
                <h4 className="text-sm font-bold text-white mb-1">Insurance Report</h4>
                <p className="text-[10px] text-slate-400">Export incident data for claim processing.</p>
              </div>

            </div>
          </section>

          <section className="bg-slate-900/50 border border-slate-800/50 rounded-3xl p-8 text-center flex flex-col items-center">
            <div className="inline-flex bg-slate-800 p-3 rounded-2xl mb-4">
              <Gauge className="text-slate-400" size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2 tracking-tight text-slate-300">Emergency Network</h3>
            <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
              Instant access to nearby <b>Trauma Centers</b> and <b>Ambulance Services</b> during road critical incidents.
            </p>
          </section>
        </main>
        <InstallAppBanner />
        <EmergencySOSModal 
          isOpen={isSosModalOpen} 
          isConfirmed={isConfirmedHelpArriving || isConfirmedNeon} 
          onClose={() => setIsSosModalOpen(false)} 
        />
      </div>
    </APIProvider>
  );
}
